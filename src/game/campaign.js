import { updateStanding } from './standing.js';
import { emptyComp, GS, MAP, rndIn, seedRng, setMap } from './state.js';
import { BIOME, generateMap, rng32 } from '../map/generate.js';
import { BUILD, FACTIONS, hasImp, NEUTRAL, PLAYER } from './data.js';
import { makeArmy } from './armies.js';
import { fillStats } from './chronicle.js';
import { relOf } from './diplomacy.js';

/* =========================================================
   Campaign setup
   ========================================================= */
export function militiaMaxOf(c) {
  const base = (c.major ? 260 + c.walls * 150 : 100 + c.walls * 70) + (c.capital ? 300 : 0) + (hasImp(c, 'barracks') ? BUILD.barracks.militia : 0);
  return c.owner === NEUTRAL ? base * 2.2 : base;
}
export function computeProvYield(p) {
  const n = Math.max(1, p.cells.length), C = p.counts;
  const fertile = (C[BIOME.PLAINS] + 0.5 * C[BIOME.STEPPE] + 0.25 * C[BIOME.FOREST] + 0.2 * C[BIOME.HILLS]) / n;
  const forest = C[BIOME.FOREST] / n, rock = (C[BIOME.HILLS] + 1.6 * C[BIOME.MOUNTAIN] + C[BIOME.SNOW]) / n;
  p.yield = {
    gold: 0.5 + (p.coast > 10 ? 0.4 : 0) + (p.river > 5 ? 0.3 : 0),
    food: 0.5 + 3.2 * fertile + (p.river > 5 ? 0.4 : 0),
    wood: 0.2 + 3.0 * forest,
    stone: 0.08 + 1.45 * Math.min(1, rock),
  };
}
export function computeCityYield(c) {
  const y = { gold: c.major ? 2.2 : 0.7, food: c.major ? 0.6 : 0, wood: 0, stone: 0 };
  const n = c.near;
  if (n.forest >= 14) { y.wood += 0.8; c.spec = 'wood'; }
  else if (n.hills >= 12) { y.stone += 0.45; c.spec = 'stone'; }
  else { y.food += 0.8; c.spec = 'food'; }
  if (n.coast > 4) { y.gold += 0.3; c.port = true; }
  c.yield = y;
}

// gen: the map generator's version (map/generate.js MAP_GEN); a save made on an older one rebuilds its map with it
export function initCampaign(seed, gen) {
  setMap(generateMap(seed, gen));
  Object.assign(GS, { time: 0, armies: [], forts: [], battles: [], over: null, winner: null, rival: null, nextId: 1, stats: { won: 0, lost: 0, captured: 0, battles: 0 }, checkT: 0, rel: {}, fog: false, diff: 1, envoy: null,
    fstats: fillStats(), chron: [], hist: [], rivalF: -1, peaceT: 0, sightT: 0 });
  // every pair of powers, in a fixed order (relOf would otherwise create them as they are first read, the screen's
  // reads included, so the saved state would depend on what was on screen)
  for (let f = 0; f < FACTIONS.length; f++) for (let g = f + 1; g < FACTIONS.length; g++) relOf(f, g);
  seedRng(seed);
  GS.factions = FACTIONS.map((F, i) => ({
    id: i, ...F, res: { gold: 500, food: 500, wood: 400, stone: 300 },
    inc: { gold: 0, food: 0, wood: 0, stone: 0 }, upk: { gold: 0, food: 0, wood: 0, stone: 0 }, net: { gold: 0, food: 0, wood: 0, stone: 0 },
    alive: true, isPlayer: i === PLAYER, pts: 0, share: 0, stretch: 1, starving: false, unpaid: false, aiT: 1 + rndIn(0, 1.8), eliminatedAt: 0, provoked: {}, oath: 0, noDealT: 0, intel: {},
  }));
  GS.cityAt = new Int16Array(MAP.W * MAP.H).fill(-1);
  for (const c of MAP.cities) GS.cityAt[c.cell] = c.id;
  for (const p of MAP.provinces) { p.owner = NEUTRAL; computeProvYield(p); }
  for (const c of MAP.cities) { c.owner = NEUTRAL; c.walls = 0; c.wallBuild = null; c.queue = []; c.capital = false; c.loyal = 1; c.imps = []; c.impBuild = null; computeCityYield(c); }

  const mc = (p) => MAP.cities[p.major];
  const starts = startingProvinces(seed), caps = starts.map((list) => list[0]);
  starts.forEach((list, f) => {
    for (const p of list) claimProvince(p, f);
    mc(list[0]).capital = true; mc(list[0]).walls = 1;
  });
  for (const c of MAP.cities) { c.militiaMax = militiaMaxOf(c); c.militia = c.militiaMax; }
  updateStanding();

  // starting armies
  caps.forEach((p, f) => {
    const c = mc(p), mix = FACTIONS[f].mix, comp = emptyComp();
    for (const t of ['leg', 'arch', 'cav']) comp[t] = Math.round(900 * mix[t] / 50) * 50;
    comp.spear = 900 - comp.leg - comp.arch - comp.cav;   // every power starts with exactly 900 men
    const a = makeArmy(f, comp, c.x + 1.5, c.y + 1.5);
    a.stance = GS.factions[f].isPlayer ? 'aggr' : 'def';
  });
}
/** The four powers' starting provinces, in power order: spread as far apart as possible, then dealt out at random.
 * Depends only on the map and its seed (the screen uses it too, for each region's building style). */
export function startingCapitals(seed) {
  const P = MAP.provinces, rnd = rng32(seed * 13 + 5);
  const mc = (p) => MAP.cities[p.major];
  const big = P.filter((p) => p.cells.length > MAP.landCount / P.length * 0.6);
  const caps = [big[Math.floor(rnd() * big.length)]];
  while (caps.length < 4) {
    let best = null, bd = -1;
    for (const p of big) {
      if (caps.includes(p)) continue;
      const d = Math.min(...caps.map((q) => Math.hypot(mc(p).x - mc(q).x, mc(p).y - mc(q).y)));
      if (d > bd) { bd = d; best = p; }
    }
    caps.push(best);
  }
  // deal the four starting spots out at random, so no power always gets the first (random) pick
  for (let i = caps.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [caps[i], caps[j]] = [caps[j], caps[i]]; }
  return caps;
}
/** Each power's starting provinces, in power order: its capital's, then the largest free neighbour. */
export function startingProvinces(seed) {
  const P = MAP.provinces, caps = startingCapitals(seed), taken = new Set();
  return caps.map((p) => {
    taken.add(p);
    const nb = p.neighbors.map((k) => P[k]).filter((q) => !taken.has(q) && !caps.includes(q)).sort((a, b) => b.cells.length - a.cells.length)[0];
    if (nb) taken.add(nb);
    return nb ? [p, nb] : [p];
  });
}
export function claimProvince(p, f) {
  p.owner = f;
  MAP.cities[p.major].owner = f;
  for (const id of p.small) MAP.cities[id].owner = f;
}
