import { cellOf, GS, MAP } from './state.js';
import { recordProvince } from './chronicle.js';

/* =========================================================
   Standing: provinces, victory and the size of each empire
   A province belongs to a power only while it holds every place in it: the major city, every town, and every
   finished fort built inside it. Split between holders it is disputed; with no power in it, it is free.
   Victory: hold PROV_WIN of the provinces (or be the last power standing).
   Settlement points (a major city 3, a town 1) measure the size of an empire: they set the land income shares
   and the overstretch penalty, not victory.
   ========================================================= */
export const SET_W = (c) => (c.major ? 3 : 1);
export const PROV_WIN = 0.6, SECURE = 1.12, OVER_RATE = 0.8, OVER_FLOOR = 0.6, OVER_SLOW = 3;
// an empire is overstretched past its fair share of the settlements: an even split between the powers still standing,
// plus 5% (30% while all four stand, 38% with three, 55% with two), so the last powers are not all taxed alike
export const FAIR = { extra: 0.05 };
export const fairShare = () => 1 / Math.max(1, GS.factions.filter((F) => F.alive).length) + FAIR.extra;
export const DISPUTED = -2;   // province owner: split between several holders (NEUTRAL, -1: every place is free)
export let STAND = { total: 1, provinces: 1, need: 1 };
// PROV.version changes whenever a place in any province changes hands (the map repaints then)
export const PROV = { version: 0 };
export const needProv = () => Math.ceil(MAP.provinces.length * PROV_WIN);
// a province's places: its settlements, then the finished forts inside it
export function placesOf(P) {
  const L = [{ kind: 'city', ref: MAP.cities[P.major] }];
  for (const id of P.small) L.push({ kind: 'city', ref: MAP.cities[id] });
  for (const f of P.forts || []) L.push({ kind: 'fort', ref: f });
  return L;
}
export const fortProv = (f) => MAP.prov[cellOf(f.x, f.y)];
// who holds what in every province; returns the provinces whose owner changed, as [P, previous owner]
export function updateProvinces() {
  for (const P of MAP.provinces) P.forts = [];
  for (const f of GS.forts) if (!f.dead && f.built >= 1) { const p = fortProv(f); if (p >= 0) MAP.provinces[p].forts.push(f); }
  const changed = [];
  for (const P of MAP.provinces) {
    const owners = placesOf(P).map((x) => x.ref.owner), sig = owners.join(',');
    if (sig === P.sig) continue;
    const holders = [...new Set(owners)];
    const owner = holders.length === 1 ? holders[0] : DISPUTED;
    if (P.sig !== undefined && owner !== P.owner) changed.push([P, P.owner]);
    P.sig = sig; P.holders = holders; P.owner = owner;
    PROV.version++;
  }
  return changed;
}
// does power f hold at least one place in province P?
export const holdsIn = (P, f) => !!P.holders && P.holders.includes(f);
export function updateStanding() {
  const changed = updateProvinces();
  for (const [P, prev] of changed) recordProvince(P, prev);
  let total = 0;
  for (const F of GS.factions) { F.pts = 0; F.provs = 0; }
  for (const c of MAP.cities) { const w = SET_W(c); total += w; if (c.owner >= 0) GS.factions[c.owner].pts += w; }
  for (const P of MAP.provinces) if (P.owner >= 0) GS.factions[P.owner].provs++;
  STAND.total = total; STAND.provinces = MAP.provinces.length; STAND.need = needProv();
  const fair = fairShare();
  for (const F of GS.factions) {
    F.share = F.pts / total;                     // the size of the empire: overstretch
    F.vshare = F.provs / STAND.provinces;        // the road to victory: the others turn on whoever leads it
    F.stretch = Math.max(OVER_FLOOR, 1 - OVER_RATE * Math.max(0, F.share - fair));
  }
  return changed;
}
export const provW = (P) => 3 + P.small.length;
// held whole, forts included: its land yields SECURE
export const provSecure = (P) => P.owner >= 0;
