import { GS, MAP } from './state.js';

export const SET_W = (c) => (c.major ? 3 : 1);
export const WIN_SHARE = 0.5, FAIR_SHARE = 0.3, SECURE = 1.12, OVER_RATE = 0.8, OVER_FLOOR = 0.6, OVER_SLOW = 3;
export let STAND = { total: 1, need: 1 };
// after 25 minutes of war a clear hegemon is enough: the bar eases from 50% to 40% over the next 10 minutes
export const winShare = () => WIN_SHARE - Math.min(0.1, Math.max(0, (GS.time - 1500) / 6000));
export function updateStanding() {
  let total = 0;
  for (const F of GS.factions) F.pts = 0;
  for (const c of MAP.cities) { const w = SET_W(c); total += w; if (c.owner >= 0) GS.factions[c.owner].pts += w; }
  STAND.total = total; STAND.need = Math.ceil(total * winShare());
  for (const F of GS.factions) { F.share = F.pts / total; F.stretch = Math.max(OVER_FLOOR, 1 - OVER_RATE * Math.max(0, F.share - FAIR_SHARE)); }
}
export const provW = (P) => 3 + P.small.length;
export function provSecure(P) { const o = MAP.cities[P.major].owner; return o >= 0 && P.small.every((id) => MAP.cities[id].owner === o); }
