// The battle lab: isolated battles fought by the game's own combat code (battleRound), without dice (no noise, no
// luck), between armies of equal worth. Deterministic and fast, so it measures the units and the combat rules
// exactly: who counters whom, whether any unit is the best buy everywhere, how each power's usual army fares
// against the others', and what walls and siege engines are worth.
import { initCampaign, militiaMaxOf } from '../../src/game/campaign.js';
import { battleRound, sideBroken, sideComp, sideMen } from '../../src/game/battles.js';
import { emptyComp, MAP, menOf } from '../../src/game/state.js';
import { BIOME } from '../../src/map/generate.js';
import { B as BAL, BUILD, ECON, SIG, sigOf, TERRAIN_DEF, U, VS } from '../../src/game/data.js';
import { costSum } from '../../src/game/chronicle.js';

export const LAB_SEED = 4242;     // the continent the lab's battles are fought on (only its ground matters)
export const HORIZON = 180;       // seconds of upkeep (food and pay) counted in a unit's worth
export const BUDGET = 6000;       // worth of each army in the lab's battles
export const TYPES = ['spear', 'arch', 'cav', 'leg'];
export const POWERS = ['Rome', 'Carthage', 'Gaul', 'Egypt'];
// the fighters of the matchup table: the three common units, then each power's elite unit
export const FIGHTERS = [['spear', 0], ['arch', 0], ['cav', 0], ['leg', 0], ['leg', 1], ['leg', 2], ['leg', 3]];
export const fighterName = ([t, f]) => (t === 'leg' ? SIG[f].name : U(t, 0).name);
export const GROUND = { plains: BIOME.PLAINS, steppe: BIOME.STEPPE, forest: BIOME.FOREST, desert: BIOME.DESERT, hills: BIOME.HILLS, mountains: BIOME.MOUNTAIN };

let cells = null;
// a dry cell of each kind of ground, on the lab's continent
export function groundCell(name) {
  if (!MAP || MAP.seed !== LAB_SEED || !cells) {
    initCampaign(LAB_SEED);
    cells = {};
    for (let i = 0; i < MAP.W * MAP.H; i++) {
      const b = MAP.biome[i];
      if (MAP.river[i] || MAP.prov[i] < 0) continue;
      for (const k in GROUND) if (GROUND[k] === b && !cells[k]) cells[k] = { x: i % MAP.W, y: (i / MAP.W) | 0 };
    }
  }
  return cells[name] || cells.plains;
}
// what n men of type t (one engine for siege) are worth to a power: their price before any perk, and their upkeep
// (food and pay) over HORIZON seconds. Perks are weighed apart (the economy lab).
export function worthOf(t, f, H = HORIZON) {
  const u = U(t, f);
  const pay = t === 'siege' ? 0 : ECON.pay * (t === 'cav' || (t === 'leg' && sigOf(f).beast) ? 2 : 1);
  return costSum(u.cost) + H * (u.upk + pay);
}
export const unitsOf = (t) => (t === 'siege' ? 1 : 100);
export function compWorth(comp, f) { let v = 0; for (const t of ['spear', 'leg', 'arch', 'cav', 'siege']) v += (comp[t] || 0) / unitsOf(t) * worthOf(t, f); return v; }
// an army of worth V: all of type t, or a mix (shares of the men, as the AI recruits them)
export function armyOf(spec, f, V = BUDGET) {
  const comp = emptyComp();
  const mix = typeof spec === 'string' ? { [spec]: 1 } : spec;
  let per = 0, sum = 0;   // worth of one "recruit" of the mix
  for (const t in mix) { sum += mix[t]; per += mix[t] * worthOf(t, f) / unitsOf(t); }
  for (const t in mix) comp[t] = V * (mix[t] / sum) / (per / sum);
  return comp;
}

/**
 * One battle, a attacking b (compositions; fa, fb: their powers). ground: 'plains', 'forest'...; kind: 'field' or 'city'
 * (then walls and militia defend with b). Fought round by round as in the game, the pursuit included.
 * Returns the winner (0: the attacker), the rounds, what each side has left and its worth.
 */
export function fight({ a, b, fa = 0, fb = 1, ground = 'plains', kind = 'field', walls = 0, militia = 0, aStance = 'aggr', bStance = 'def', dugIn = true, river = false, flank = false }) {
  const c = groundCell(ground);
  const army = (comp, owner, stance) => ({ comp: Object.assign(emptyComp(), comp), owner, stance, wins: 0, state: 'battle', dead: false, x: c.x, y: c.y });
  const side = (faction, armies, mil) => { const s = { faction, armies, militia: mil, start: 0 }; s.start = sideMen(s); return s; };
  const place = kind === 'field' ? null : { walls, militia, x: c.x, y: c.y, major: true };
  const A = army(a, fa, aStance), D = b && menOf(Object.assign(emptyComp(), b)) + (b.siege || 0) > 0 ? army(b, fb, bStance) : null;
  const bio = GROUND[ground];
  const Bt = {
    kind, place, x: c.x, y: c.y, round: 0, t: 0, done: false, luck: [1, 1],
    terrainDef: TERRAIN_DEF[bio] || 1, rough: bio === BIOME.FOREST || bio === BIOME.MOUNTAIN, river, dugIn: kind !== 'field' || dugIn, flank,
    sides: [side(fa, [A], null), side(fb, D ? [D] : [], kind === 'field' ? null : { men: militia, sp: kind === 'city' ? 0.7 : 0.5, ref: place })],
  };
  let winner = -1;
  while (winner < 0) {
    battleRound(Bt, null, false);
    const br0 = sideBroken(Bt.sides[0]), br1 = sideBroken(Bt.sides[1]);
    if (br0 || br1 || Bt.round > 60) winner = br1 && !br0 ? 0 : br0 && !br1 ? 1 : (br0 && br1 && sideMen(Bt.sides[0]) / Bt.sides[0].start > sideMen(Bt.sides[1]) / Bt.sides[1].start ? 0 : 1);
  }
  // the pursuit: the winner's horsemen cut down the fleeing (as endBattle does)
  const W = sideComp(Bt.sides[winner]), wMen = menOf(W);
  const riders = W.cav + (sigOf(Bt.sides[winner].faction).mounted ? W.leg : 0);
  const pursuit = wMen > 0 ? Math.min(0.25, (riders / wMen) * 0.6) : 0;
  const left = [A ? A.comp : emptyComp(), D ? D.comp : emptyComp()].map((x) => Object.assign({}, x));
  for (const t in left[1 - winner]) left[1 - winner][t] *= 1 - pursuit;
  return { winner, rounds: Bt.round, left, worth: [compWorth(left[0], fa), compWorth(left[1], fb)], militia: Bt.sides[1].militia ? Bt.sides[1].militia.men : 0 };
}
// how far ahead x comes out of a fight with y, at equal worth: (x's worth left - y's worth left) / worth at the start,
// from -1 (wiped out, y untouched) to 1; the mean of x attacking and x defending
export function edge(x, fx, y, fy, opts = {}) {
  const ax = armyOf(x, fx), ay = armyOf(y, fy);
  const r1 = fight(Object.assign({ a: ax, b: ay, fa: fx, fb: fy }, opts));
  const r2 = fight(Object.assign({ a: ay, b: ax, fa: fy, fb: fx }, opts));
  return ((r1.worth[0] - r1.worth[1]) + (r2.worth[1] - r2.worth[0])) / (2 * BUDGET);
}
// the matchup table: edge of every fighter over every other, on a ground
export function matchups(ground = 'plains') {
  return FIGHTERS.map((x) => FIGHTERS.map((y) => (x === y ? 0 : edge(x[0], x[1], y[0], y[1], { ground }))));
}
// the counters the rules mean to create: [winner, loser] fighter indices. The common table (VS) and each elite's own
// (vs: deals more, hurt: takes more, beats: the elite it overpowers)
export function intendedCounters() {
  const idx = (t, f) => FIGHTERS.findIndex(([u, g]) => u === t && (t !== 'leg' || g === f));
  const out = [];
  for (const t in VS) for (const v in VS[t]) if (VS[t][v] > 1 && v !== 'siege' && v !== 'leg') out.push([idx(t, 0), idx(v, 0), `${t} > ${v}`]);
  SIG.forEach((S, f) => {
    for (const v in BAL.elite[S.key].vs) if (BAL.elite[S.key].vs[v] > 1.25 && v !== 'siege') out.push([idx('leg', f), idx(v, 0), `${S.key} > ${v}`]);
    for (const v in BAL.elite[S.key].hurt) if (BAL.elite[S.key].hurt[v] > 1.15 && v !== 'shot') out.push([idx(v, 0), idx('leg', f), `${v} > ${S.key}`]);
    if (BAL.elite[S.key].hurt.shot > 1.15) out.push([idx('arch', 0), idx('leg', f), `arch > ${S.key}`]);
    const g = SIG.findIndex((x) => x.key === S.beats);
    if (g >= 0) out.push([idx('leg', f), idx('leg', g), `${S.key} > ${S.beats}`]);
  });
  return out;
}
// each power's usual army (its AI recruiting taste) against the others', at equal worth: on open ground, and on the
// attacker's favourite ground for its elite (home) when it has one
export function powerArmies(ground = 'plains') {
  return [0, 1, 2, 3].map((f) => [0, 1, 2, 3].map((g) => (f === g ? 0 : edge(BAL.ai.mix[f], f, BAL.ai.mix[g], g, { ground }))));
}
// the smallest army of power f's usual mix (worth) that takes a major city with these walls, with `engines` siege
// engines (bought on top). Binary search on the worth.
export function worthToTake(f, walls, engines = 0) {
  const mil = militiaMaxOf({ major: true, walls, capital: false, owner: 0, imps: [] });
  const takes = (V) => { const a = armyOf(BAL.ai.mix[f], f, V); a.siege = engines; return fight({ a, b: null, fa: f, fb: (f + 1) % 4, kind: 'city', walls, militia: mil }).winner === 0; };
  let lo = 200, hi = 400;
  while (!takes(hi) && hi < 1e6) { lo = hi; hi *= 2; }
  for (let k = 0; k < 18; k++) { const m = (lo + hi) / 2; if (takes(m)) hi = m; else lo = m; }
  return hi + engines * worthOf('siege', f);
}
// walls and engines: what it takes (in worth) to storm a major city at each wall level, without engines and with
// enough to knock every level down; and what a level of walls costs
export function siegeTable(f = 0) {
  return [0, 1, 2, 3].map((w) => ({
    walls: w, without: worthToTake(f, w), withEngines: w ? worthToTake(f, w, 2 * w) : null,
    wallCost: w ? costSum(BUILD.walls.cost[w - 1]) : 0,
  }));
}
