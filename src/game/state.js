import { FACTIONS, RES } from './data.js';

export let MAP = null;
export function setMap(m) { MAP = m; }
export const GS = { time: 0, speed: 1, auto: false, factions: [], armies: [], forts: [], battles: [], over: null, nextId: 1, stats: { won: 0, lost: 0, captured: 0 }, cityAt: null, checkT: 0 };

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
