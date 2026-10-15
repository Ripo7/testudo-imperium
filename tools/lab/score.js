// The scorecard: every lab measure against its target band (tools/lab/targets.js). Each item outside its band costs
// weight x (distance / band width)^2; the total is what the tuner brings down. 0: everything within its band.
import { TARGETS } from './targets.js';
import { FIGHTERS, fighterName, matchups, POWERS, powerArmies } from './battle.js';
import { economyLab } from './economy.js';
import { IMP_KEYS } from './war.js';

export function penalty(v, [lo, hi], weight = 1) {
  const d = v < lo ? lo - v : v > hi ? v - hi : 0;
  return weight * (d / Math.max(1e-9, hi - lo)) ** 2;
}
const item = (section, name, value, T, extra) => Object.assign({ section, name, value, band: T.band, penalty: penalty(value, T.band, T.weight) }, extra || {});
export const fighterIndex = (key) => { const [t, f] = key.split('@'); return FIGHTERS.findIndex(([u, g]) => u === t && (t !== 'leg' || g === +f)); };

// the battle lab's measures (fast: a few seconds)
export function battleLab() { return { matchups: matchups('plains'), powerArmies: powerArmies('plains') }; }
export function scoreBattles(B, T = TARGETS.battles) {
  const out = [];
  for (const [w, l] of T.counters.pairs) { const i = fighterIndex(w), j = fighterIndex(l); out.push(item('battles', `${fighterName(FIGHTERS[i])} beat ${fighterName(FIGHTERS[j])}`, B.matchups[i][j], T.counters)); }
  FIGHTERS.forEach((x, i) => out.push(item('battles', `${fighterName(x)}: mean edge`, B.matchups[i].reduce((s, v) => s + v, 0) / (FIGHTERS.length - 1), T.dominance)));
  POWERS.forEach((p, f) => out.push(item('battles', `${p}'s usual army: mean edge`, B.powerArmies[f].reduce((s, v) => s + v, 0) / 3, T.powerArmies)));
  return out;
}
export function scoreEconomy(E, T = TARGETS.economy) {
  const out = [];
  for (const k in E.payback) out.push(item('economy', `${k[0].toUpperCase() + k.slice(1)}: seconds to pay back`, E.payback[k], T.payback));
  for (const w of E.walls) out.push(item('economy', `Walls level ${w.level}: attacking worth per resource`, w.leverage, T.wallLeverage));
  for (const w of E.walls) if (w.level >= 2) out.push(item('economy', `Siege engines at walls ${w.level}: worth needed with them / without`, w.engines, T.engines));
  return out;
}
// the war lab's measures, from its war records (tools/lab/war.js)
export function warSummary(R) {
  const n = R.length, wins = [0, 1, 2, 3].map((f) => R.filter((r) => r.winner === f).length);
  const times = R.map((r) => r.time / 60).sort((a, b) => a - b);
  const sum = (f) => R.reduce((s, r) => s + f(r), 0);
  const raised = [0, 1, 2, 3].map((f) => { const c = { spear: 0, leg: 0, arch: 0, cav: 0, siege: 0 }; for (const r of R) for (const t in c) c[t] += r.counts.recruit[f][t]; return c; });
  return {
    n, wins, share: wins.map((w) => w / n), ci: wins.map((w) => wilson(w, n)),
    median: times[Math.floor(n / 2)], p10: times[Math.floor(n * 0.1)], p90: times[Math.min(n - 1, Math.floor(n * 0.9))], unfinished: R.filter((r) => !r.over).length / n,
    raised, imps: [0, 1, 2, 3].map((f) => Object.fromEntries(IMP_KEYS.map((k) => [k, sum((r) => r.counts.imps[f][k]) / n]))),
    forts: sum((r) => r.counts.forts.reduce((a, b) => a + b, 0)) / n, retreats: sum((r) => r.counts.retreats.reduce((a, b) => a + b, 0)) / n,
    revolts: sum((r) => r.counts.revolts.reduce((a, b) => a + b, 0)) / n, peaces: sum((r) => r.counts.peaces) / n, wars: sum((r) => r.counts.wars) / n,
    perk: [0, 1, 2, 3].map((f) => Math.round(sum((r) => r.perk[f]) / n)),
  };
}
// a 95% interval for a share of k in n (Wilson)
export function wilson(k, n, z = 1.96) {
  if (!n) return [0, 1];
  const p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  return [(c - m) / d, (c + m) / d];
}
export function scoreWars(S, T = TARGETS.wars) {
  const out = [];
  POWERS.forEach((p, f) => out.push(item('wars', `${p}: share of the wins`, S.share[f], T.winShare, { ci: S.ci[f] })));
  out.push(item('wars', 'Median war (minutes)', S.median, T.medianMin));
  out.push(item('wars', 'Wars at the time limit', S.unfinished, T.unfinished));
  POWERS.forEach((p, f) => {
    const c = S.raised[f], men = c.spear + c.leg + c.arch + c.cav;
    for (const t of ['spear', 'arch', 'cav', 'leg']) out.push(item('wars', `${p}: ${t === 'leg' ? 'elite unit' : t} share of the units raised`, men ? c[t] / men : 0, T.unitShare));
    for (const k of IMP_KEYS) out.push(item('wars', `${p}: ${k} built per war`, S.imps[f][k], T.impsPerWar));
  });
  for (const k of ['forts', 'retreats', 'revolts', 'peaces']) out.push(item('wars', `${k[0].toUpperCase() + k.slice(1)} per war`, S[k], T[k]));
  return out;
}
export const total = (items) => items.reduce((s, x) => s + x.penalty, 0);
export function fastScore() {
  const items = scoreBattles(battleLab()).concat(scoreEconomy(economyLab()));
  return { items, total: total(items) };
}
