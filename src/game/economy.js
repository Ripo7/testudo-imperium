import { atWar } from './diplomacy.js';
import { fairShare, holdsIn, provSecure, provW, SET_W, updateStanding } from './standing.js';
import { canAfford, cellOf, emptyComp, GS, MAP, menOf, pay, provAt } from './state.js';
import { BIOME } from '../map/generate.js';
import {
  BUILD, buildTime, diffOf, ECON, fortCost, hasImp, impCost, IMPS, impSlots, MARKET, perkOf, RES, sigOf, U, unitCost, UNITS, unitTime, wallCost, wallTime,
} from './data.js';
import { militiaMaxOf } from './campaign.js';
import { makeArmy } from './armies.js';
import { HOOKS } from './hooks.js';
import { bump, costSum, recordEconomy } from './chronicle.js';

// gold paid for, or received for, 100 food, wood or stone
export const marketOf = (f) => perkOf(f).market || MARKET;
export function trade(F, r, dir) {
  const M = marketOf(F.id);
  if (dir === 'buy') { if (F.res.gold < M.buy) return false; F.res.gold -= M.buy; F.res[r] += MARKET.lot; bump(F.id, 'mBuy', M.buy); return true; }
  if (F.res[r] < MARKET.lot) return false;
  F.res[r] -= MARKET.lot; F.res.gold += M.sell; bump(F.id, 'mSell', M.sell); return true;
}

/* =========================================================
   Economy
   ========================================================= */
export function economy(dt) {
  for (const F of GS.factions) { for (const r of RES) { F.inc[r] = 0; F.upk[r] = 0; } }
  updateStanding();
  GS.raid = new Map();
  for (const a of GS.armies) {
    if (a.dead || a.state === 'battle' || a.state === 'rout') continue;
    const p = provAt(a.x, a.y); if (p < 0) continue;
    if (!GS.raid.has(p)) GS.raid.set(p, []);
    GS.raid.get(p).push(a);
  }
  const fair = fairShare();
  for (const c of MAP.cities) {
    const own = c.owner >= 0 ? GS.factions[c.owner] : null;
    // a sprawling empire is slow to settle its conquests
    const temple = own && hasImp(c, 'temple');
    if (c.loyal < 1) c.loyal = Math.min(1, c.loyal + dt * (temple ? BUILD.temple.loyalty : 1) / (ECON.loyalTime * (own ? 1 + ECON.overSlow * Math.max(0, own.share - fair) : 1)));
    if (own && c.impBuild) {
      const ib = c.impBuild; ib.t += dt / (IMPS[ib.id].time * buildTime(c.owner));
      if (ib.t >= 1) { c.imps.push(ib.id); c.impBuild = null; bump(c.owner, 'works'); c.militiaMax = militiaMaxOf(c); HOOKS.impDone(c, ib.id); HOOKS.cityChanged(c); }
    }
    if (own && !(c.battle && !c.battle.done)) { const k = 0.8 * c.loyal * (temple ? 1 - (1 - own.stretch) * BUILD.temple.stretch : own.stretch) * (own.isPlayer ? 1 : diffOf().inc), y = cityYield(c, c.owner), l = landShare(c), pk = plunderer(c.prov, c.owner) ? ECON.plunder : 1; for (const r of RES) own.inc[r] += (y[r] + l[r] * pk) * k; if (pk < 1) bump(c.owner, 'plund', costSum(l) * (1 - pk) * k * dt); }
    // militia regen
    if (!(c.battle && !c.battle.done) && c.militia < c.militiaMax) c.militia = Math.min(c.militiaMax, c.militia + c.militiaMax * 0.012 * dt);
    // building walls
    if (c.wallBuild) { c.wallBuild.t += dt / (wallTime(c.wallBuild.level) * buildTime(c.owner)); if (c.wallBuild.t >= 1) { c.walls = c.wallBuild.level; c.wallBuild = null; bump(c.owner, 'works'); c.militiaMax = militiaMaxOf(c); HOOKS.cityChanged(c); HOOKS.wallsDone(c); } }
    // recruiting
    if (c.queue.length && c.owner >= 0 && !(c.battle && !c.battle.done)) {
      const q = c.queue[0];
      q.t += dt / (unitTime(q.type, c.owner) * (hasImp(c, 'barracks') ? BUILD.barracks.speed : 1));
      if (q.t >= 1) { c.queue.shift(); spawnRecruits(c, q.type); }
    }
  }
  for (const f of GS.forts) {
    if (f.built < 1) { f.built = Math.min(1, f.built + dt / (BUILD.fort.time * buildTime(f.owner))); f.militia = BUILD.fort.max * f.built * 0.6; HOOKS.fortChanged(f); }
    else if (!(f.battle && !f.battle.done)) f.militia = Math.min(BUILD.fort.max, f.militia + BUILD.fort.max * 0.02 * dt);
  }
  for (const a of GS.armies) {
    if (a.dead) continue;
    const F = GS.factions[a.owner];
    const p = provAt(a.x, a.y);
    const P = p >= 0 ? MAP.provinces[p] : null;
    const home = !!P && holdsIn(P, a.owner);
    const k = home || (P && P.holders.some((h) => atWar(a.owner, h))) ? 1 : ECON.abroad;   // at war, they forage on enemy land
    for (const t of ['spear', 'leg', 'arch', 'cav']) F.upk.food += a.comp[t] / 100 * U(t, a.owner).upk * k * (perkOf(a.owner).feed || 1);
    F.upk.food += a.comp.siege * UNITS.siege.upk;
    F.upk.gold += armyPay(a);
    // attrition: hungry or unpaid soldiers melt away, and so do armies in deserts and snow far from home
    let attr = (F.starving ? 0.006 : 0) + (F.unpaid ? 0.005 : 0);
    const b = MAP.biome[cellOf(a.x, a.y)];
    if (!home && (b === BIOME.SNOW || (b === BIOME.DESERT && !perkOf(a.owner).desertMarch))) attr += 0.004;
    else if (!home && b === BIOME.MOUNTAIN) attr += 0.002;   // cold, falls and lost stragglers in the mountains
    if (attr > 0 && a.state !== 'battle') for (const t of ['spear', 'leg', 'arch', 'cav']) a.comp[t] = Math.max(0, a.comp[t] * (1 - attr * dt));
    if (menOf(a.comp) < 5 && a.comp.siege < 1 && a.state !== 'battle') a.dead = true;
  }
  for (const F of GS.factions) {
    for (const r of RES) { F.net[r] = F.inc[r] - F.upk[r]; F.res[r] += F.net[r] * dt; }
    F.starving = F.res.food <= 0;
    F.unpaid = F.res.gold <= 0;
    if (F.res.food < 0) F.res.food = 0;
    if (F.res.gold < 0) F.res.gold = 0;
    recordEconomy(F, dt);
  }
  GS.armies = GS.armies.filter((a) => !a.dead || false);
}
// soldiers' pay: gold per second
export function armyPay(a) { return (menOf(a.comp) + a.comp.cav + (sigOf(a.owner).beast ? a.comp.leg : 0)) / 100 * ECON.pay * (perkOf(a.owner).pay || 1); }
// the slice of its province's land income a settlement brings its owner (before the 0.8 × loyalty × stretch factor)
// an army at war with the owner, loose in the province and not within reach of one of the owner's forts
export function plunderer(p, owner) {
  const L = GS.raid && GS.raid.get(p);
  if (!L || owner < 0) return null;
  for (const a of L) if (atWar(a.owner, owner) && !GS.forts.some((f) => !f.dead && f.owner === owner && f.built >= 1 && Math.hypot(f.x - a.x, f.y - a.y) < BUILD.fort.guard)) return a;
  return null;
}
export function landShare(c) {
  const P = MAP.provinces[c.prov], y = provYield(P, c.owner), k = SET_W(c) / provW(P) * (provSecure(P) ? ECON.secure : 1);
  return { gold: y.gold * k, food: y.food * k, wood: y.wood * k, stone: y.stone * k };
}
// income after the owner's speciality (before the 0.8 × loyalty factor)
export function provYield(p, f) {
  const P = perkOf(f), y = p.yield;
  return { gold: y.gold * (P.gold || 1), food: y.food * (P.nile && p.river > 5 ? P.nile : 1), wood: y.wood, stone: y.stone };
}
export function cityYield(c, f) {
  const P = perkOf(f), y = c.yield;
  return { gold: (y.gold + (P.port && c.port ? P.port : 0) + (hasImp(c, 'forum') ? BUILD.forum.gold : 0)) * (P.gold || 1), food: y.food + (hasImp(c, 'farm') ? BUILD.farm.food : 0), wood: y.wood, stone: y.stone };
}
export function spawnRecruits(c, type) {
  const add = U(type, c.owner).n;
  let a = GS.armies.find((x) => !x.dead && x.owner === c.owner && x.state === 'idle' && Math.hypot(x.x - c.x, x.y - c.y) < 2.4);
  if (!a) {
    let px = c.x + 1.4, py = c.y + 1.2;
    if (!(MAP.move[cellOf(px, py)] < Infinity)) { px = c.x; py = c.y; }
    a = makeArmy(c.owner, emptyComp(), px, py);
    a.stance = GS.factions[c.owner].isPlayer ? 'aggr' : 'def';
  }
  a.comp[type] += add;
  if (type !== 'siege') bump(c.owner, 'raised', add);
  HOOKS.recruited(c, type, a);
}
export function recruit(F, c, type) {
  if (c.owner !== F.id || c.queue.length >= 5 || (c.battle && !c.battle.done)) return false;
  const cost = unitCost(type, F.id);
  if (!canAfford(F, cost)) return false;
  pay(F, cost);
  c.queue.push({ type, t: 0 });
  bump(F.id, 'sRec', costSum(cost));
  return true;
}
export function fortify(F, c) {
  if (c.owner !== F.id || c.wallBuild || c.walls >= 3) return false;
  const cost = wallCost(F.id, c.walls + 1);
  if (!canAfford(F, cost)) return false;
  pay(F, cost);
  c.wallBuild = { level: c.walls + 1, t: 0 };
  bump(F.id, 'sBuild', costSum(cost));
  return true;
}
export function buildImp(F, c, id) {
  if (c.owner !== F.id || !IMPS[id] || c.impBuild || hasImp(c, id) || c.imps.length >= impSlots(c)) return false;
  const cost = impCost(F.id, id);
  if (!canAfford(F, cost)) return false;
  pay(F, cost);
  c.impBuild = { id, t: 0 };
  bump(F.id, 'sBuild', costSum(cost));
  return true;
}
export function fortSpotOk(f, x, y) {
  x = Math.round(x); y = Math.round(y);
  if (x < 1 || y < 1 || x >= MAP.W - 1 || y >= MAP.H - 1) return false;
  const i = y * MAP.W + x;
  if (!(MAP.move[i] < Infinity)) return false;
  const b = MAP.biome[i];
  if (b === BIOME.MOUNTAIN || b === BIOME.SNOW || MAP.river[i]) return false;
  const p = MAP.prov[i];
  if (p < 0 || !holdsIn(MAP.provinces[p], f)) return false;
  if (MAP.cities.some((c) => Math.hypot(c.x - x, c.y - y) < 3)) return false;
  if (GS.forts.some((o) => Math.hypot(o.x - x, o.y - y) < 4)) return false;
  return true;
}
export function buildFort(F, x, y) {
  const cost = fortCost(F.id);
  if (!fortSpotOk(F.id, x, y) || !canAfford(F, cost)) return null;
  pay(F, cost);
  const f = { id: GS.nextId++, owner: F.id, x: Math.round(x), y: Math.round(y), built: 0, militia: 0, dead: false, battle: null };
  GS.forts.push(f);
  bump(F.id, 'works'); bump(F.id, 'sBuild', costSum(cost));
  HOOKS.fortBuilt(f);
  return f;
}
