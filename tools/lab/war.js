// The war lab's unit of work: one AI-vs-AI war in plain Node, with every mechanic counted through the simulation's
// hooks (no code probes needed), what each power did with its economy, and a sample of its perk's worth each minute.
import { setHooks, HOOKS } from '../../src/game/hooks.js';
import { applyParams, resetParams } from '../../src/game/params.js';
import { GS, MAP } from '../../src/game/state.js';
import { BUILD, ECON, perkOf } from '../../src/game/data.js';
import { holdsIn } from '../../src/game/standing.js';
import { newWar, playUntil, TIME_LIMIT } from '../headless.js';

export const UNIT_KEYS = ['spear', 'leg', 'arch', 'cav', 'siege'];
export const IMP_KEYS = ['farm', 'forum', 'barracks', 'temple'];
const zeros = (keys) => Object.fromEntries(keys.map((k) => [k, 0]));
export const newCounts = () => ({
  recruit: [0, 1, 2, 3].map(() => zeros(UNIT_KEYS)), imps: [0, 1, 2, 3].map(() => zeros(IMP_KEYS)),
  walls: [0, 0, 0, 0], forts: [0, 0, 0, 0], retreats: [0, 0, 0, 0], revolts: [0, 0, 0, 0], captures: [0, 0, 0, 0],
  battles: { field: 0, city: 0, fort: 0, attackerWon: 0 }, wars: 0, peaces: 0, tribute: 0,
});
// what a power's speciality brings it right now, in resources per second (an estimate: the economic part only;
// Egypt's safe desert marches and the faster recruiting or building have no price here)
export function perkWorth(f) {
  const P = perkOf(f), F = GS.factions[f];
  if (!F || !F.alive) return 0;
  const mine = MAP.cities.filter((c) => c.owner === f);
  const k = (c) => 0.8 * c.loyal * F.stretch;
  let v = 0;
  if (P.port) v += mine.filter((c) => c.port).reduce((s, c) => s + P.port * k(c), 0);
  if (P.feed) v += F.upk.food * (1 / P.feed - 1);
  if (P.nile) for (const Pv of MAP.provinces) if (Pv.river > 5 && holdsIn(Pv, f)) {
    const share = mine.filter((c) => c.prov === Pv.id).reduce((s, c) => s + (c.major ? 3 : 1) * k(c), 0) / (3 + Pv.small.length);
    v += Pv.yield.food * (P.nile - 1) * share * (Pv.owner === f ? ECON.secure : 1);
  }
  return v;
}
// spending a discount saves: what the power spent, times what it would have cost more
export function discountWorth(f, st) {
  const P = perkOf(f);
  let v = 0;
  if (P.build) v += st.sBuild * (1 / P.build - 1);
  if (P.unitCost) v += st.sRec * (1 / P.unitCost - 1);
  if (P.costMul && P.costMul.food) v += st.sRec * 0.3 * (1 / P.costMul.food - 1);   // food is about 30% of a unit's price
  return v;
}

/**
 * Play one war. params: values to apply on top of the defaults (null: the defaults).
 * Returns who won and when, each power's provinces, stats and mechanic counts, and its perk's worth per minute.
 */
export function playLabWar(seed, { params = null, fog = true, limit = TIME_LIMIT } = {}) {
  resetParams(); if (params) applyParams(params);
  const C = newCounts(), old = Object.assign({}, HOOKS);
  setHooks({
    recruited: (c, type) => { if (c.owner >= 0) C.recruit[c.owner][type]++; },
    impDone: (c, id) => { if (c.owner >= 0) C.imps[c.owner][id]++; },
    wallsDone: (c) => { if (c.owner >= 0) C.walls[c.owner]++; },
    fortBuilt: (f) => { C.forts[f.owner]++; },
    retreated: (a) => { C.retreats[a.owner]++; },
    cityCaptured: (c, prev, f) => { if (f < 0 && prev >= 0) C.revolts[prev]++; else if (f >= 0) C.captures[f]++; },
    battleEnd: (B) => { C.battles[B.kind]++; if (B.winner === 0) C.battles.attackerWon++; },
    warDeclared: () => { C.wars++; },
    peaceMade: (f, g, payer, paid) => { C.peaces++; if (paid) C.tribute++; },
  });
  const worth = [0, 0, 0, 0], alive = [0, 0, 0, 0];
  try {
    newWar(seed, { fog });
    for (let m = 1; !GS.over && GS.time < limit; m++) {
      playUntil(Math.min(limit, m * 60));
      for (let f = 0; f < 4; f++) if (GS.factions[f].alive) { alive[f]++; worth[f] += perkWorth(f) * 60; }
    }
  } finally { setHooks(old); }
  const provs = GS.factions.map((F) => F.provs);
  const stats = GS.fstats.map((s) => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, Math.round(v)])));
  return {
    seed, over: !!GS.over, time: Math.round(GS.time),
    winner: GS.over ? GS.winner : provs.indexOf(Math.max(...provs)),
    provs, alive: GS.factions.map((F) => F.alive), elim: GS.factions.map((F) => (F.alive ? null : Math.round(F.eliminatedAt))),
    counts: C, stats,
    // the perk's worth in resources per minute the power was alive: income it adds, plus what its discounts saved
    perk: [0, 1, 2, 3].map((f) => Math.round((worth[f] + discountWorth(f, GS.fstats[f])) / Math.max(1, alive[f]))),
    aliveMin: alive,
    fortsHeld: [0, 1, 2, 3].map((f) => GS.forts.filter((x) => !x.dead && x.owner === f && x.built >= 1).length),
    walls: [0, 1, 2, 3].map((f) => MAP.cities.filter((c) => c.owner === f).reduce((s, c) => s + c.walls, 0)),
    fortMax: BUILD.fort.max,
  };
}
