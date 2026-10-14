// Balance check: AI-vs-AI wars to the end. Prints win rates, war length and economy snapshots.
//   npm run balance -- [wars=40] [workers=3]
import fs from 'node:fs';
import path from 'node:path';
import { serve, ROOT } from '../tests/helpers.js';
import { runWars, quantiles, NAMES } from './wars.js';

const N = +process.argv[2] || 40, WORKERS = +process.argv[3] || 3;
const WAR = `async (seed) => {
  const T = window.__T; T.setNoRender(true);
  T.prepareCampaign(seed); T.setAuto(true); T.GS.speed = 0;
  const snaps = {};
  while (!T.GS.over && T.GS.time < 3600) {
    for (let i = 0; i < 50; i++) { T.simStep(0.1); if (T.GS.over) break; }
    const t = Math.round(T.GS.time);
    for (const m of [240, 600, 1200]) if (!snaps[m] && t >= m) snaps[m] = {
      pts: T.GS.factions.map((F) => F.pts),
      men: T.GS.factions.map((F) => Math.round(T.GS.armies.filter((a) => !a.dead && a.owner === F.id).reduce((s, a) => s + a.comp.spear + a.comp.leg + a.comp.arch + a.comp.cav, 0))),
      res: T.GS.factions.map((F) => ['gold', 'food', 'wood', 'stone'].map((r) => Math.round(F.res[r]))),
      wars: Object.values(T.GS.rel).filter((R) => R.war).length,
    };
    await new Promise((r) => setTimeout(r, 0));
  }
  const pts = T.GS.factions.map((F) => F.pts);
  return { over: !!T.GS.over, time: Math.round(T.GS.time), winner: T.GS.over ? T.GS.winner : pts.indexOf(Math.max(...pts)), pts,
           alive: T.GS.factions.map((F) => F.alive), snaps };
}`;

const site = await serve();
const out = path.join(ROOT, 'tools/out'); fs.mkdirSync(out, { recursive: true });
const file = path.join(out, `balance-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`);
const R = await runWars({ url: site.url, n: N, workers: WORKERS, fn: WAR,
  onResult: (r, k, n) => { fs.appendFileSync(file, JSON.stringify(r) + '\n'); console.log(`${String(k).padStart(3)}/${n}  ${NAMES[r.winner]} wins after ${(r.time / 60).toFixed(1)} min${r.over ? '' : ' (time limit)'}`); } });
site.close();

const wins = NAMES.map((_, f) => R.filter((r) => r.winner === f).length);
const q = quantiles(R.map((r) => r.time / 60));
console.log(`\n${R.length} wars`);
console.log('wins      ' + NAMES.map((nm, f) => `${nm} ${wins[f]} (${Math.round(wins[f] / R.length * 100)}%)`).join(' · '));
console.log(`length    median ${q.p50.toFixed(1)} min · p10 ${q.p10.toFixed(1)} · p90 ${q.p90.toFixed(1)} · longest ${q.max.toFixed(1)} · unfinished ${R.filter((r) => !r.over).length}`);
console.log(`powers wiped out: ${R.reduce((s, r) => s + r.alive.filter((a) => !a).length, 0)}`);
for (const m of ['240', '600', '1200']) {
  const S = R.map((r) => r.snaps[m]).filter(Boolean);
  if (!S.length) continue;
  const avg = (f) => (S.reduce((s, x) => s + f(x), 0) / S.length);
  console.log(`\nat ${m / 60} min (${S.length} wars): wars going on ${avg((x) => x.wars).toFixed(1)} of 6`);
  NAMES.forEach((nm, f) => console.log(`  ${nm.padEnd(9)} points ${avg((x) => x.pts[f]).toFixed(1).padStart(5)}  men ${Math.round(avg((x) => x.men[f])).toString().padStart(5)}  gold/food/wood/stone ${[0, 1, 2, 3].map((i) => Math.round(avg((x) => x.res[f][i]))).join(' / ')}`));
}
console.log(`\nraw results: ${path.relative(ROOT, file)}`);
