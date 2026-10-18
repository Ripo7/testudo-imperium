// The tuner: finds better balance values with the labs (tools/lab/) and either proposes them or applies them.
//   node tools/tune.js                        fast, then fair, then validate (all three)
//   node tools/tune.js fast                   units, elites, combat and buildings, with the battle and economy labs
//   node tools/tune.js fair                   the powers' perks (TARGETS.levers), with the war lab, until the win shares fall in band
//   options: --groups units,elite,combat,buildings   what fast may move    --gens 80      fast's generations
//            --rounds 4 --wars 120                    fair's rounds, wars per round      --validate 240  wars to check the result
//            --apply                                  write balance.js (otherwise only propose)
//            --out dir                                where the report goes (default tools/out/tune-<date>)
//            --seed 1                                 the search's own random numbers (the wars' seeds are fixed)
//   node tools/tune.js report --proposal p.json --before a.json,b.json --after c.json,d.json [--apply] [--out dir]
//                                             the report from war records played elsewhere (the CI's shards: tools/lab.js --records)
import fs from 'node:fs';
import path from 'node:path';
import { applyParams, changedParams, PARAM, PARAMS, paramsHash, paramValues, resetParams } from '../src/game/params.js';
import { runJobs, cores } from './lab/pool.js';
import { TARGETS } from './lab/targets.js';
import { battleLab, scoreBattles, scoreEconomy, scoreWars, total, warSummary } from './lab/score.js';
import { economyLab } from './lab/economy.js';
import { labWars } from './lab.js';
import { writeBalance, ROOT } from './params.js';
import { writeReport } from './lab/report.js';

export const FAST_GROUPS = ['units', 'elite', 'combat', 'buildings'];
// the search's own random numbers (mulberry32), so a tuning run can be repeated
export function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export const gauss = (r) => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
const norm = (P, v) => (P.max > P.min ? (v - P.min) / (P.max - P.min) : 0);
const denorm = (P, u) => { const v = P.min + Math.min(1, Math.max(0, u)) * (P.max - P.min); return P.int ? Math.round(v) : +v.toPrecision(4); };

/**
 * Fast: a (1+λ) search on the battle and economy labs' penalty, plus mu for every unit of change (each parameter's
 * range counting 1), so it only moves what pays. It first nudges every parameter once to learn which ones can bring
 * the penalty down, then mutates one to three of those at a time.
 */
export async function fastSearch({ groups = FAST_GROUPS, gens = 80, workers = cores(), mu = 0.25, seed = 1, log = console.log } = {}) {
  const r = rng(seed), x0 = paramValues(), vars = PARAMS.filter((P) => groups.includes(P.group) && !P.fixed);
  const evalMany = async (xs) => (await runJobs(xs.map((x) => ({ fn: 'fast', args: [x] })), { workers })).map((res, i) => ({ x: xs[i], res, f: res.total + mu * cost(xs[i]) }));
  const cost = (x) => vars.reduce((s, P) => s + Math.abs(norm(P, x[P.id]) - norm(P, x0[P.id])), 0);
  const [base] = await evalMany([x0]);
  log(`fast: ${vars.length} parameters (${groups.join(', ')}), penalty ${base.res.total.toFixed(3)}`);
  if (base.res.total < 1e-9) return { x: x0, base, best: base, gens: 0, scan: [] };
  // which parameters move the penalty: each one nudged by a tenth of its range, both ways
  const nudges = [];
  for (const P of vars) for (const s of [-1, 1]) { const u = norm(P, x0[P.id]) + s * 0.1; if (u < 0 || u > 1) continue; nudges.push({ P, s, x: Object.assign({}, x0, { [P.id]: denorm(P, u) }) }); }
  const scanned = await evalMany(nudges.map((n) => n.x));
  const gainOf = new Map(vars.map((P) => [P.id, 0]));
  scanned.forEach((e, i) => { const g = base.res.total - e.res.total; if (g > gainOf.get(nudges[i].P.id)) gainOf.set(nudges[i].P.id, g); });
  const scan = vars.map((P) => ({ id: P.id, gain: gainOf.get(P.id) })).sort((a, b) => b.gain - a.gain);
  const useful = scan.filter((s) => s.gain > 1e-4);
  log(`fast: ${useful.length} parameters can lower the penalty on their own; the best: ${useful.slice(0, 6).map((s) => `${s.id} (${s.gain.toFixed(3)})`).join(', ')}`);
  // mutate the useful ones mostly (weighted by what they gained), any other now and then
  const weights = vars.map((P) => gainOf.get(P.id) + 0.002), wsum = weights.reduce((a, b) => a + b, 0);
  const pick = () => { let t = r() * wsum; for (let i = 0; i < vars.length; i++) { t -= weights[i]; if (t <= 0) return vars[i]; } return vars[vars.length - 1]; };
  let best = base, sigma = 0.12, stall = 0, g = 0;
  for (; g < gens && best.res.total > 1e-9 && stall < 20; g++) {
    const xs = Array.from({ length: Math.max(2, workers * 2) }, () => {
      const x = Object.assign({}, best.x), k = 1 + Math.floor(r() * 3);
      for (let i = 0; i < k; i++) { const P = pick(); x[P.id] = denorm(P, norm(P, x[P.id]) + gauss(r) * sigma); }
      return x;
    });
    const out = await evalMany(xs);
    const top = out.reduce((a, b) => (b.f < a.f ? b : a));
    if (top.f < best.f - 1e-6) { best = top; sigma = Math.min(0.3, sigma * 1.25); stall = 0; log(`fast: generation ${g + 1}, penalty ${best.res.total.toFixed(3)}, ${Object.keys(changedParams(x0, best.x)).length} parameters moved`); }
    else { sigma = Math.max(0.02, sigma * 0.85); stall++; }
  }
  // prune: put back every changed value the penalty doesn't need (a change that came along with a useful one)
  for (let round = 0; round < 4; round++) {
    const moved = Object.keys(changedParams(x0, best.x));
    if (!moved.length) break;
    const tries = await evalMany(moved.map((id) => Object.assign({}, best.x, { [id]: x0[id] })));
    const back = moved.filter((id, i) => tries[i].res.total <= best.res.total + 0.005);
    if (!back.length) break;
    const [both] = await evalMany([Object.assign({}, best.x, Object.fromEntries(back.map((id) => [id, x0[id]])))]);
    if (both.res.total <= best.res.total + 0.005 * back.length) { best = both; log(`fast: put back ${back.length} value(s) it didn't need: ${back.join(', ')}`); }
    else { const one = tries[moved.indexOf(back[0])]; best = one; log(`fast: put back ${back[0]}`); }
  }
  log(`fast: penalty ${base.res.total.toFixed(3)} -> ${best.res.total.toFixed(3)}, ${Object.keys(changedParams(x0, best.x)).length} parameters changed`);
  return { x: best.x, base, best, gens: g, scan };
}

/**
 * Fair: rounds of wars on fresh seeds. After each, a power's lever moves only when its share of the wins is out of
 * band beyond doubt (its 95% interval misses the band entirely): with a few hundred wars a share is only known to a
 * few points, and moving on noise would chase it. The move is in proportion to the gap (gain: the share of the
 * lever's range moved for a gap of 0.1), and shrinks round after round.
 */
export async function fairLoop({ x, rounds = 4, wars = 120, workers = cores(), gain = 1, from = 0, log = console.log } = {}) {
  const T = TARGETS.wars.winShare.band, levers = TARGETS.levers, hist = [];
  x = Object.assign({}, x);
  for (let k = 0; k < rounds; k++) {
    const R = await labWars(wars, { params: x, workers, from: from + k * wars });
    const S = warSummary(R);
    const sure = S.ci.map(([a, b]) => (b < T[0] ? -1 : a > T[1] ? 1 : 0));   // -1: surely too few wins, 1: surely too many
    hist.push({ levers: levers.map(([id]) => x[id]), share: S.share, ci: S.ci, median: S.median, unfinished: S.unfinished, moved: [] });
    log(`fair: round ${k + 1}, wins ${S.share.map((s, f) => `${Math.round(s * 100)}%${sure[f] ? (sure[f] > 0 ? '↑' : '↓') : ''}`).join(' / ')} (${wars} wars, ±${Math.round((S.ci[0][1] - S.ci[0][0]) * 50)} points), median ${S.median.toFixed(1)} min`);
    if (!sure.some(Boolean) || k === rounds - 1) break;
    const step = gain / (1 + 0.5 * k);
    levers.forEach(([id, dir], f) => {
      if (!sure[f]) return;
      const P = PARAM.get(id), s = S.share[f], gap = s < T[0] ? s - T[0] : s - T[1];
      const before = x[id];
      x[id] = denorm(P, norm(P, x[id]) - dir * step * gap);   // a gap of 0.1 moves the lever by step x 10% of its range
      hist[k].moved.push(id);
      log(`fair: ${id} ${before} -> ${x[id]}`);
    });
  }
  return { x, hist };
}
export const VALIDATION_FROM = 100000;   // validation wars are played from this seed on: seeds the tuning never plays
export async function measure(x, { wars = 240, workers = cores(), from = VALIDATION_FROM, records = null } = {}) {
  resetParams(); applyParams(x);
  const battles = battleLab(), economy = economyLab();
  const R = records || (wars ? await labWars(wars, { params: x, workers, from }) : []);
  const S = R.length ? warSummary(R) : null;
  const items = scoreBattles(battles).concat(scoreEconomy(economy), S ? scoreWars(S) : []);
  const hash = paramsHash();
  resetParams();
  return { battles, economy, wars: S, items, total: total(items), hash };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
// what to do with the result: write balance.js only when asked to and when it does better on the validation wars
export function finish({ out, x0, x, before, after, fast, fair, lines, apply, log }) {
  const changes = changedParams(x0, x), better = after.total < before.total - 1e-9;
  log(`penalty ${before.total.toFixed(2)} -> ${after.total.toFixed(2)}, ${Object.keys(changes).length} parameters changed`);
  fs.writeFileSync(path.join(out, 'proposal.json'), JSON.stringify(Object.fromEntries(Object.entries(changes).map(([id, [, v]]) => [id, v])), null, 1));
  if (apply) {
    if (better && Object.keys(changes).length) { applyParams(x); writeBalance(); log(`balance.js written (set ${paramsHash()})`); }
    else log('not applied: the values found do no better than the current ones on the validation wars');
  }
  fs.writeFileSync(path.join(out, 'verdict.json'), JSON.stringify({ better, applied: !!(apply && better && Object.keys(changes).length), changed: Object.keys(changes).length, before: before.total, after: after.total }));
  writeReport(out, { before, after, changes, fast, fair, log: lines, applied: !!(apply && better) });
  log(`report: ${path.relative(ROOT, path.join(out, 'report.html'))} · ${path.relative(ROOT, path.join(out, 'summary.md'))}`);
}

if (isMain) {
  const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  const steps = ['fast', 'fair', 'report'].filter((s) => args.includes(s));
  const doFast = !steps.length || steps.includes('fast'), doFair = !steps.length || steps.includes('fair');
  const workers = +opt('--workers', cores()), nVal = +opt('--validate', 240);
  const out = opt('--out', path.join(ROOT, 'tools/out', `tune-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`));
  fs.mkdirSync(out, { recursive: true });
  const lines = [];
  const log = (s) => { console.log(s); lines.push(s); };
  const t0 = Date.now(), x0 = paramValues();
  let x = x0, fast = null, fair = null;
  if (steps.includes('report')) {
    // the CI's last step: the proposal and the validation wars its shards played
    const load = (list) => list.split(',').flatMap((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
    x = Object.assign({}, x0, opt('--proposal') ? JSON.parse(fs.readFileSync(opt('--proposal'), 'utf8')) : {});
    const before = await measure(x0, { records: load(opt('--before')) }), after = await measure(x, { records: load(opt('--after')) });
    finish({ out, x0, x, before, after, fast, fair, lines, apply: args.includes('--apply'), log });
  } else {
    if (doFast) { fast = await fastSearch({ groups: opt('--groups', FAST_GROUPS.join(',')).split(','), gens: +opt('--gens', 80), workers, seed: +opt('--seed', 1), log }); x = fast.x; }
    if (doFair) { fair = await fairLoop({ x, rounds: +opt('--rounds', 4), wars: +opt('--wars', 120), workers, log }); x = fair.x; }
    log(nVal ? `validating on ${nVal} wars the tuner never saw, before and after…` : 'no validation wars (--validate 0): the labs only');
    const before = await measure(x0, { wars: nVal, workers }), after = await measure(x, { wars: nVal, workers });
    log(`in ${Math.round((Date.now() - t0) / 60000)} min`);
    finish({ out, x0, x, before, after, fast, fair, lines, apply: args.includes('--apply'), log });
  }
}
