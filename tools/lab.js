// The balance labs and their scorecard (tools/lab/): how the current values (src/game/balance.js) measure up.
//   node tools/lab.js                      battle and economy labs (a few seconds)
//   node tools/lab.js wars 120             and 120 AI wars on every core (the same seeds every time)
//   node tools/lab.js --params set.json    try values from a file ({ "units.spear.atk": 0.8, ... }) on top of balance.js
//   node tools/lab.js --json out.json      also save every measure
//   node tools/lab.js wars 50 --from 200 --records r.json   wars from the 200th seed on, their records saved (a CI shard)
import fs from 'node:fs';
import path from 'node:path';
import { applyParams, paramsHash, paramValues } from '../src/game/params.js';
import { FIGHTERS, fighterName, POWERS } from './lab/battle.js';
import { economyLab } from './lab/economy.js';
import { battleLab, scoreBattles, scoreEconomy, scoreWars, total, warSummary } from './lab/score.js';
import { runJobs, cores } from './lab/pool.js';

export const SEED0 = 1000, SEED_STEP = 7919;   // war k is played on seed SEED0 + k * SEED_STEP
export const seeds = (n, from = 0) => Array.from({ length: n }, (_, k) => SEED0 + (from + k) * SEED_STEP);
export const pct = (v) => `${Math.round(v * 100)}%`;
export const f2 = (v) => (v >= 0 ? ' ' : '') + v.toFixed(2);

/** Play n wars (seeds from `from`) with these values on top of the defaults, on every core. */
export async function labWars(n, { params = null, workers = cores(), from = 0, onResult } = {}) {
  return runJobs(seeds(n, from).map((s) => ({ fn: 'war', args: [s, { params }] })), { workers, onResult });
}
export function printBattles(B) {
  const names = FIGHTERS.map(fighterName);
  console.log('\nBattle lab · equal worth, open ground: the row\'s edge over the column (-1 wiped out .. +1 untouched)');
  console.log(''.padEnd(15) + names.map((n) => n.slice(0, 7).padStart(8)).join('') + '    mean');
  B.matchups.forEach((row, i) => console.log(names[i].padEnd(15) + row.map((v, j) => (i === j ? '.' : f2(v)).padStart(8)).join('') + f2(row.reduce((s, v) => s + v, 0) / (row.length - 1)).padStart(8)));
  console.log('\nEach power\'s usual army (its AI recruiting taste) against the others\', equal worth, open ground');
  B.powerArmies.forEach((row, f) => console.log(POWERS[f].padEnd(15) + row.map((v, g) => (f === g ? '.' : f2(v)).padStart(8)).join('') + f2(row.reduce((s, v) => s + v, 0) / 3).padStart(8)));
}
export function printEconomy(E) {
  console.log(`\nEconomy lab · farmlands pay back in ${Math.round(E.payback.farm)} s, a forum in ${Math.round(E.payback.forum)} s`);
  for (const w of E.walls) console.log(`  walls ${w.level}: cost ${w.cost}, attackers need ${Math.round(w.extra)} more worth (×${w.leverage.toFixed(1)}); with siege engines ${pct(w.engines)} of the worth without`);
}
export function printWars(S) {
  console.log(`\nWar lab · ${S.n} AI wars, fog of war on`);
  console.log('wins      ' + POWERS.map((p, f) => `${p} ${S.wins[f]} (${pct(S.share[f])}, ${pct(S.ci[f][0])}–${pct(S.ci[f][1])})`).join(' · '));
  console.log(`length    median ${S.median.toFixed(1)} min · p10 ${S.p10.toFixed(1)} · p90 ${S.p90.toFixed(1)} · at the time limit ${pct(S.unfinished)}`);
  console.log(`per war   forts ${S.forts.toFixed(1)} · retreats ${S.retreats.toFixed(1)} · revolts ${S.revolts.toFixed(1)} · wars ${S.wars.toFixed(1)} · peace treaties ${S.peaces.toFixed(1)}`);
  POWERS.forEach((p, f) => {
    const c = S.raised[f], men = c.spear + c.leg + c.arch + c.cav;
    console.log(`  ${p.padEnd(9)} units raised: spear ${pct(c.spear / men)} elite ${pct(c.leg / men)} arch ${pct(c.arch / men)} cav ${pct(c.cav / men)} · engines ${(c.siege / S.n).toFixed(1)}/war · improvements/war ${Object.entries(S.imps[f]).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(' ')} · perk worth ${S.perk[f]}/min`);
  });
}
export function printScore(items) {
  const bad = items.filter((x) => x.penalty > 1e-9).sort((a, b) => b.penalty - a.penalty);
  const by = {}; for (const x of items) by[x.section] = (by[x.section] || 0) + x.penalty;
  console.log(`\nScorecard · ${items.length - bad.length} of ${items.length} measures within their targets · penalty ${total(items).toFixed(2)} (${Object.entries(by).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(', ')})`);
  for (const x of bad) console.log(`  ${x.penalty.toFixed(2).padStart(6)}  ${x.name}: ${Math.abs(x.value) < 10 ? x.value.toFixed(2) : Math.round(x.value)} (target ${x.band.join('–')})${x.ci ? `, 95% interval ${pct(x.ci[0])}–${pct(x.ci[1])}` : ''}`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  const args = process.argv.slice(2), opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  let params = null;
  if (opt('--params')) { params = JSON.parse(fs.readFileSync(opt('--params'), 'utf8')); applyParams(params); }
  console.log(`Values: balance.js${params ? ` + ${Object.keys(params).length} from ${opt('--params')}` : ''} (set ${paramsHash()})`);
  const B = battleLab(), E = economyLab();
  printBattles(B); printEconomy(E);
  let items = scoreBattles(B).concat(scoreEconomy(E)), S = null;
  const wi = args.indexOf('wars');
  if (wi >= 0) {
    const n = +args[wi + 1] || 60, t0 = Date.now();
    const R = await labWars(n, { params, from: +opt('--from') || 0, workers: +opt('--workers') || cores(), onResult: (r, j, done) => { if (done % 10 === 0 || done === n) process.stdout.write(`\r  ${done}/${n} wars`); } });
    console.log(` in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    if (opt('--records')) fs.writeFileSync(opt('--records'), JSON.stringify(R));
    S = warSummary(R); printWars(S); items = items.concat(scoreWars(S));
  }
  printScore(items);
  if (opt('--json')) fs.writeFileSync(opt('--json'), JSON.stringify({ values: paramValues(), hash: paramsHash(), battles: B, economy: E, wars: S, items }, null, 1));
}
