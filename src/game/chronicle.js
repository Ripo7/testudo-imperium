import { sees } from './sight.js';
import { GS, MAP, menOf } from './state.js';
import { FACTIONS } from './data.js';
import { nearestCity } from './armies.js';
import { sideMen } from './battles.js';

/* =========================================================
   The record of the war, read by the Overview panel and the end-of-war report:
     GS.chron   what happened: wars, peace treaties, battles, revolts, powers wiped out
     GS.hist    each power's victory points and men under arms, every HIST_EVERY seconds
     GS.fstats  running totals per power
   It is all simulation state: deterministic, and saved with the game.
   ========================================================= */
export const HIST_EVERY = 10;   // seconds of game time between samples
export const newStats = () => ({
  won: 0, lost: 0, captured: 0, lostC: 0, kills: 0, dead: 0, raised: 0, peak: 0,
  wars: 0, peaces: 0, tribP: 0, tribR: 0, revolts: 0, works: 0,
});
// every power's stats, with the fields older saves lack set to zero
export const fillStats = (list) => FACTIONS.map((_, i) => Object.assign(newStats(), (list && list[i]) || {}));

// which powers saw what happened at (x, y): bit f is set when power f saw it or took part
export function seenMask(x, y, parties) {
  let m = 0;
  for (const F of GS.factions) if (parties.includes(F.id) || sees(F.id, x, y)) m |= 1 << F.id;
  return m;
}
export const sawIt = (e, f) => e.v == null || ((e.v >> f) & 1) === 1;
export function record(e) { e.t = Math.round(GS.time * 10) / 10; GS.chron.push(e); return e; }
const stat = (f) => (f >= 0 && GS.fstats[f] ? GS.fstats[f] : null);
export function bump(f, key, n = 1) { const s = stat(f); if (s) s[key] += n; }

// diplomacy
export function recordWar(f, g, broke) { record({ k: 'war', f, g, b: broke ? 1 : 0 }); bump(f, 'wars'); }
export function recordPeace(f, g, payer, paid) {
  record({ k: 'peace', f, g, p: paid ? payer : -1, n: paid });
  bump(f, 'peaces'); bump(g, 'peaces');
  if (paid) { bump(payer, 'tribP', paid); bump(payer === f ? g : f, 'tribR', paid); }
}
// a city changes hands (after a battle, or in a revolt: f = NEUTRAL)
export function recordCapture(c, prev, f) {
  bump(f, 'captured'); bump(prev, 'lostC');
  if (f < 0 && prev >= 0) { bump(prev, 'revolts'); record({ k: 'rev', g: prev, c: c.id, v: seenMask(c.x, c.y, [prev]) }); }
}
// a battle is over: k 'bat', a/d attacker and defender, w winning side (0 attacker, 1 defender), l men lost on each side,
// p where (f field, c city, t fort), c the city (or the nearest one), x/y the spot, v who saw it
export function recordBattle(B) {
  const a = B.sides[0].faction, d = B.sides[1].faction;
  const l = B.sides.map((S) => Math.max(0, Math.round(S.start - (S.left || 0) - sideMen(S))));
  const place = B.kind === 'city' ? B.place : nearestCity(B.x, B.y);
  record({ k: 'bat', a, d, w: B.winner, l, p: B.kind === 'fort' ? 't' : B.kind === 'city' ? 'c' : 'f', c: place ? place.id : -1, x: Math.round(B.x), y: Math.round(B.y), v: seenMask(B.x, B.y, [a, d]) });
  const wf = B.sides[B.winner].faction, lf = B.sides[1 - B.winner].faction;
  bump(wf, 'won'); bump(lf, 'lost');
  bump(a, 'dead', l[0]); bump(a, 'kills', l[1]);
  bump(d, 'dead', l[1]); bump(d, 'kills', l[0]);
}
export function recordFall(f) { record({ k: 'fall', f }); }

// one row per sample: [time, points of each power..., men of each power...]
export function sampleHistory() {
  const men = GS.factions.map(() => 0);
  for (const a of GS.armies) if (!a.dead && a.owner >= 0) men[a.owner] += menOf(a.comp);
  const row = [Math.round(GS.time)];
  for (const F of GS.factions) row.push(F.pts);
  GS.factions.forEach((F, i) => { const m = Math.round(men[i]); row.push(m); if (m > GS.fstats[i].peak) GS.fstats[i].peak = m; });
  GS.hist.push(row);
}
export function historyTick() {
  const H = GS.hist, last = H.length ? H[H.length - 1][0] : -Infinity;
  if (GS.time - last >= HIST_EVERY) sampleHistory();
}
// the latest sample at least `ago` seconds old (for trends)
export function sampleAgo(ago) {
  const H = GS.hist;
  for (let i = H.length - 1; i >= 0; i--) if (GS.time - H[i][0] >= ago) return H[i];
  return H[0] || null;
}
export const cityOf = (e) => (e.c != null && e.c >= 0 && MAP.cities[e.c]) || null;
