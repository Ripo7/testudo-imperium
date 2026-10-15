// The economy lab: what buildings and walls give back for their price, and what each power pays for its units
// once its speciality is applied. Computed directly from the rules (no simulation), so it is exact and instant.
import { BUILD, ECON, FACTIONS, IMPS, unitCost } from '../../src/game/data.js';
import { costSum } from '../../src/game/chronicle.js';
import { siegeTable, worthOf } from './battle.js';

export const INCOME_K = 0.8;   // a settled city's income factor (0.8 x loyalty x stretch; loyalty 1, no overstretch)
// seconds for an improvement that yields income to pay for itself (resources counted one for one, as the market
// roughly does: buying costs 1.3 gold, selling brings 0.7)
export function paybacks() {
  return {
    farm: costSum(IMPS.farm.cost) / (BUILD.farm.food * INCOME_K),
    forum: costSum(IMPS.forum.cost) / (BUILD.forum.gold * INCOME_K),
  };
}
// walls: how much more an attacker must bring (in worth) for every resource spent on a level of walls
export function wallLeverage(f = 0) {
  const T = siegeTable(f);
  return T.slice(1).map((r, i) => ({ level: r.walls, cost: r.wallCost, extra: r.without - T[i].without, leverage: (r.without - T[i].without) / r.wallCost, engines: r.withEngines / r.without }));
}
// what each power pays for each unit (all resources added up), against the price before perks
export function priceList() {
  return FACTIONS.map((F, f) => Object.fromEntries(['spear', 'leg', 'arch', 'cav', 'siege'].map((t) => [t, { cost: costSum(unitCost(t, f)), worth: Math.round(worthOf(t, f)) }])));
}
export function economyLab() {
  return { payback: paybacks(), walls: wallLeverage(0), prices: priceList(), pay: ECON.pay };
}
