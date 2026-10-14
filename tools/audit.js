// Mechanics audit: builds an instrumented copy of the game, runs AI-vs-AI wars, and counts how often
// every mechanic is actually used (recruits by type, walls, forts, market, improvements, retreats,
// wars and peace treaties, revolts...). Use it after a balance change to spot dead or dominant mechanics.
//   npm run audit -- [wars=12] [workers=3]
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'vite';
import { serve, ROOT } from '../tests/helpers.js';
import { runWars, quantiles, NAMES } from './wars.js';

const N = +process.argv[2] || 12, WORKERS = +process.argv[3] || 3;
const A = (...k) => ` window.__aud && window.__aud(${k.join(', ')});`;
// [code to find, code to add right after it]
const PROBES = [
  ['  pay(F, cost);\n  c.queue.push({ type, t: 0 });', A("'recruit'", 'type') + A("'recruitBy'", 'F.id', 'type')],
  ['  c.wallBuild = { level: c.walls + 1, t: 0 };', A("'walls'", 'c.walls + 1')],
  ['function buildFort(F, x, y) {', A("'fort'")],
  ['  c.impBuild = { id, t: 0 };', A("'imp'", 'id')],
  ['F.res.gold -= M.buy; F.res[r] += MARKET.lot;', A("'trade'", "'buy'", 'r')],
  ['F.res[r] -= MARKET.lot; F.res.gold += M.sell;', A("'trade'", "'sell'", 'r')],
  ['roundComp(a); a.battle = null; a.retreated = true;', A("'retreat'")],
  ['function captureCity(c, f) {\n  const prev = c.owner;', A("'capture'", "c.major ? 'major' : 'town'", "prev >= 0 ? 'fromPower' : 'fromNeutral'") + " if (c.imps && c.imps.length && f >= 0)" + A("'captureLootsImp'")],
  ['  B.startMen = [B.sides[0].start, B.sides[1].start];', `
  ${A("'battle'", 'kind', "defFaction >= 0 ? 'vsPower' : 'vsNeutral'")}
  if (kind === 'field') {${A("'field'", "B.river ? 'river' : 'noRiver'")}${A("'field'", "B.flank ? 'flank' : 'noFlank'")}${A("'field'", "B.rough ? 'rough' : 'open'")} }
  if (kind === 'city') {${A("'citySiege'", "'walls' + place.walls", "B.sides[0].armies.some((a) => a.comp.siege >= 1) ? 'withEngines' : 'noEngines'")} }
  if (att.length > 1)${A("'battle'", "'multiAttackers'")}`],
  ['function endBattle(B, winner) {', A("'battleEnd'", 'B.kind', "winner === 0 ? 'attackerWon' : 'defenderWon'") + " if (B.kind === 'city' && B.place.walls > 0)" + A("'wallsSiegeEnd'", "winner === 0 ? 'fell' : 'held'")],
  ['  const broke = R.lock > GS.time;\n', ` if (!R.war) {${A("'declare'", "broke ? 'breakingTreaty' : 'clean'")} (window.__audWars = window.__audWars || {})[pairKey(f, g)] = GS.time; }\n`],
  ['function makePeace(f, g, dur, payer, gold) {\n  const R = relOf(f, g);', ` if (R.war) {${A("'peace'", "payer != null && gold > 0 ? 'withTribute' : 'free'")} const t0 = (window.__audWars || {})[pairKey(f, g)]; if (t0 != null) (window.__audDur = window.__audDur || []).push(Math.round(GS.time - t0)); }`],
  ['    if (Math.random() < p) { captureCity(c, NEUTRAL);', A("'revolt'")],
  ['function showEnvoy(g, gold) {', A("'envoy'")],
];
const applied = PROBES.map(() => 0);
const probePlugin = {
  name: 'audit-probes',
  transform(code, id) {
    if (!id.includes('/src/') || !id.endsWith('.js')) return null;
    let out = code;
    PROBES.forEach(([find, add], i) => { const n = out.split(find).length - 1; if (n) { applied[i] += n; out = out.split(find).join(find + add); } });
    return out === code ? null : { code: out, map: null };
  },
  buildEnd() {
    const bad = PROBES.filter((_, i) => applied[i] !== 1).map(([find], i) => `${JSON.stringify(find.slice(0, 60))} matched ${applied[PROBES.findIndex((p) => p[0] === find)]}×`);
    if (bad.length) throw new Error('audit probes no longer match the code (update tools/audit.js):\n' + bad.join('\n'));
  },
};
const outDir = path.join(ROOT, 'tools/out/audit-dist');
await build({ root: ROOT, logLevel: 'warn', plugins: [probePlugin], build: { outDir, emptyOutDir: true, minify: false } });

const WAR = `async (seed) => {
  const T = window.__T; T.setNoRender(true);
  const c = {}; window.__aud = (...k) => { const key = k.join(':'); c[key] = (c[key] || 0) + 1; }; window.__audWars = {}; window.__audDur = [];
  T.prepareCampaign(seed); T.setAuto(true); T.GS.speed = 0;
  const S = { samples: 0, starving: 0, unpaid: 0, stretched: 0, powers: 0, lowLoyal: 0, cities: 0, withImps: 0, walls: 0, secure: 0, provs: 0, wars: 0 };
  let k = 0;
  while (!T.GS.over && T.GS.time < 3600) {
    T.simStep(0.1);
    if (++k % 50) continue;
    S.samples++;
    for (const F of T.GS.factions) if (F.alive) { S.powers++; S.starving += F.starving ? 1 : 0; S.unpaid += F.unpaid ? 1 : 0; S.stretched += F.stretch < 0.995 ? 1 : 0; }
    for (const city of T.MAP.cities) if (city.owner >= 0) { S.cities++; if (city.loyal < 0.7) S.lowLoyal++; if (city.imps.length) S.withImps++; S.walls += city.walls; }
    for (const P of T.MAP.provinces) { S.provs++; if (T.provSecure(P)) S.secure++; }
    S.wars += Object.values(T.GS.rel).filter((R) => R.war).length;
    if (k % 500 === 0) await new Promise((r) => setTimeout(r, 0));
  }
  return { time: Math.round(T.GS.time), winner: T.GS.winner, c, S, dur: window.__audDur };
}`;
const site = await serve(outDir);
const R = await runWars({ url: site.url, n: N, workers: WORKERS, fn: WAR, onResult: (r, k, n) => console.log(`${String(k).padStart(3)}/${n}  ${(r.time / 60).toFixed(1)} min, ${NAMES[r.winner] || 'nobody'} won`) });
site.close();

const C = {}, S = {};
for (const r of R) { for (const [k, v] of Object.entries(r.c)) C[k] = (C[k] || 0) + v; for (const [k, v] of Object.entries(r.S)) S[k] = (S[k] || 0) + v; }
const per = (k) => ((C[k] || 0) / R.length).toFixed(1).padStart(7);
console.log(`\n${R.length} wars, median ${quantiles(R.map((r) => r.time / 60)).p50.toFixed(1)} min\n\ncounts per war:`);
for (const k of Object.keys(C).sort()) console.log(`${per(k)}  ${k}`);
const share = (a, b) => (b ? (a / b * 100).toFixed(0) + '%' : '-');
console.log(`\nelite share of recruits: ${NAMES.map((nm, f) => { const tot = ['spear', 'leg', 'arch', 'cav'].reduce((s, t) => s + (C[`recruitBy:${f}:${t}`] || 0), 0); return `${nm} ${share(C[`recruitBy:${f}:leg`] || 0, tot)}`; }).join(' · ')}`);
console.log(`powers starving ${share(S.starving, S.powers)} · unpaid ${share(S.unpaid, S.powers)} · overstretched ${share(S.stretched, S.powers)} of the time`);
console.log(`cities: low loyalty ${share(S.lowLoyal, S.cities)} · with improvements ${share(S.withImps, S.cities)} · average walls ${(S.walls / S.cities).toFixed(2)}`);
console.log(`secure provinces ${share(S.secure, S.provs)} · wars going on at once ${(S.wars / S.samples).toFixed(2)} of 6`);
const D = R.flatMap((r) => r.dur);
if (D.length) { const q = quantiles(D); console.log(`war durations: median ${q.p50}s, p10 ${q.p10}s, p90 ${q.p90}s (${D.length} wars ended in peace)`); }
