import { FACTIONS, RES } from './data.js';

export let MAP = null;
export function setMap(m) { MAP = m; }
export const GS = { time: 0, speed: 1, auto: false, factions: [], armies: [], forts: [], battles: [], over: null, nextId: 1, stats: { won: 0, lost: 0, captured: 0 }, cityAt: null, checkT: 0, rng: 1 };

/* The simulation's own random numbers (mulberry32). Its state lives in GS.rng, so it is saved with the game and a
   resumed war draws the numbers it would have drawn. Effects and sounds use Math.random and never touch it. */
export function seedRng(seed) { GS.rng = (Math.imul((seed >>> 0) ^ 0x9e3779b9, 2654435761) >>> 0) || 1; }
export function rnd() {
  let t = (GS.rng = (GS.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const rndIn = (a, b) => a + rnd() * (b - a);
export const angDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
export const emptyComp = () => ({ spear: 0, leg: 0, arch: 0, cav: 0, siege: 0 });
export const menOf = (c) => c.spear + c.leg + c.arch + c.cav;
export const cloneComp = (c) => ({ spear: c.spear, leg: c.leg, arch: c.arch, cav: c.cav, siege: c.siege });
export const starsOf = (a) => (a.wins >= 6 ? 3 : a.wins >= 3 ? 2 : a.wins >= 1 ? 1 : 0);
export const cellOf = (x, y) => Math.round(y) * MAP.W + Math.round(x);
export const provAt = (x, y) => MAP.prov[cellOf(x, y)];
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const canAfford = (F, cost, k = 1) => RES.every((r) => F.res[r] >= (cost[r] || 0) * k);
export const pay = (F, cost, k = 1) => { for (const r of RES) F.res[r] -= (cost[r] || 0) * k; };
export const ownerName = (o) => (o >= 0 ? FACTIONS[o].name : 'Rebels');
