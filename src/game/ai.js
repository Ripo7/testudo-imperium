import { cityEstimate, knowsArmy } from './sight.js';
import { atPeace, atWar, warsOf } from './diplomacy.js';
import { canAfford, dist, emptyComp, GS, MAP, menOf, provAt, rnd } from './state.js';
import {
  BUILD, COMBAT, diffOf, fortCost, hasImp, IMP_IDS, impCost, impSlots, NEUTRAL, RIVALRY, sigOf, TYPES5, unitCost, wallCost,
} from './data.js';
import { fortProv, holdsIn, placesOf } from './standing.js';
import { mergeArmies, nearestCity, orderTarget } from './armies.js';
import { canRetreat, estimateOdds, powerOf, retreatArmy, retreatSide, sideComp, sideMen } from './battles.js';
import { buildFort, buildImp, fortify, fortSpotOk, recruit, trade } from './economy.js';
import { BALANCE } from './balance.js';

/* =========================================================
   AI
   ========================================================= */
// how much more a place is worth when taking it finishes a province (complete), leaves one place to go (nearly),
// or breaks a rival's province (breaks; breakLeader for the power closest to victory); fort: an enemy fort's base value
// need: the odds of victory an army wants before it attacks (less for aggressive powers)
export const AI_PROV = BALANCE.ai.prov;
export function aiTick(F) {
  const mine = MAP.cities.filter((c) => c.owner === F.id);
  if (!mine.length) return;
  const majors = mine.filter((c) => c.major);
  const armies = GS.armies.filter((a) => !a.dead && a.owner === F.id);
  // under the fog, the AI only reacts to the enemy armies it can see
  const hostileArmies = GS.armies.filter((a) => !a.dead && a.owner !== F.id && a.state !== 'rout' && !atPeace(F.id, a.owner) && knowsArmy(F.id, a));
  const threatOf = (c) => hostileArmies.filter((h) => Math.hypot(h.x - c.x, h.y - c.y) < 14);
  const capital = mine.find((c) => c.capital) || majors[0] || mine[0];
  // the others turn on the power closest to victory
  const topF = GS.factions.reduce((b, x) => (x.alive && (!b || x.vshare > b.vshare) ? x : b), null);
  const gang = topF && topF !== F && topF.vshare > RIVALRY.gangAt ? Math.min(RIVALRY.gangMax, (topF.vshare - RIVALRY.gangAt) * RIVALRY.gangK) : 0;
  // what taking a place is worth for the provinces: finishing one of ours, or breaking one of theirs
  const provValue = (Pv, place) => {
    const missing = placesOf(Pv).filter((x) => x.ref !== place && x.ref.owner !== F.id).length;
    const completes = missing === 0 ? AI_PROV.complete : missing === 1 ? AI_PROV.nearly : 1;
    const breaks = Pv.owner >= 0 && Pv.owner !== F.id ? (gang && Pv.owner === topF.id ? AI_PROV.breakLeader : AI_PROV.breaks) : 1;
    return completes * breaks;
  };

  // --- walls: the capital first, then threatened cities; spare stone goes into walls everywhere
  const rich = F.res.stone > 700;
  const atRisk = (c) => threatOf(c).length > 0 || MAP.cities.some((o) => o.owner >= 0 && atWar(F.id, o.owner) && Math.abs(o.x - c.x) < 22 && Math.abs(o.y - c.y) < 22);
  const wallTargets = [capital, ...majors.filter(atRisk), ...majors, ...mine.filter((c) => !c.major && atRisk(c))];
  for (const c of wallTargets) {
    if (!c || c.wallBuild || c.walls >= 3) continue;
    const front = atRisk(c);
    const want = c === capital ? (rich ? 3 : 2) : c.major ? (front ? (rich ? 2 : 1) : F.res.stone > 400 ? 1 : 0) : front && F.res.stone > 450 ? 1 : 0;
    if (c.walls < want && F.res.stone > wallCost(F.id, c.walls + 1).stone + 40 && canAfford(F, wallCost(F.id, c.walls + 1))) { fortify(F, c); break; }
  }
  // --- market: sell a hoard when gold runs short, buy what's running out when gold piles up
  const goldShort = F.res.gold < 250;
  for (const r of ['food', 'wood', 'stone']) {
    if (F.res[r] > (r === 'stone' ? (goldShort ? 750 : 1500) : goldShort ? 450 : 1500)) trade(F, r, 'sell');   // stone is kept for walls
    else if (F.res[r] < (r === 'food' ? 260 : 200) && F.res.gold > 380) { trade(F, r, 'buy'); if (F.res.gold > 900) trade(F, r, 'buy'); }
  }
  // --- improvements: one new building per visit, once the basics are covered
  if (F.res.gold > 260 && F.res.wood > 110 && F.res.stone > 140) {
    let pick = null, ps = 0.6;
    for (const c of mine) {
      if (c.impBuild || c.imps.length >= impSlots(c) || (c.battle && !c.battle.done)) continue;
      const nearFront = threatOf(c).length > 0 || (c.major && Math.min(...MAP.cities.filter((o) => o.owner !== F.id).map((o) => Math.hypot(o.x - c.x, o.y - c.y)), 99) < 16);
      const sc = {
        farm: (F.net.food < 1.5 ? 2.6 : 0.8) + (c.spec === 'food' ? 0.4 : 0),
        forum: F.res.gold < 500 ? 2.2 : 1.2,
        barracks: nearFront ? 2.4 : 0.3,
        temple: c.loyal < 0.6 ? 3 : c.loyal < 0.8 ? 2 : F.stretch < 0.92 ? 1.6 : 0.2,
      };
      for (const id of IMP_IDS) {
        if (hasImp(c, id) || sc[id] <= ps || !canAfford(F, impCost(F.id, id), 1.5)) continue;
        ps = sc[id]; pick = [c, id];
      }
    }
    if (pick) buildImp(F, pick[0], pick[1]);
  }
  // --- recruiting, as long as food and pay hold out (a big enough stockpile covers a deficit for a while)
  const armyMen = armies.reduce((s, a) => s + menOf(a.comp), 0);
  const desired = 700 + 520 * majors.length + 120 * (mine.length - majors.length);
  const sustain = (r) => F.net[r] > -1.5 || F.res[r] > -F.net[r] * 150;
  const front = (mine.filter((c) => c.major).length ? majors : mine).map((c) => {
    const e = nearestCity(c.x, c.y, (o) => o.owner !== F.id);
    return [e ? Math.hypot(e.x - c.x, e.y - c.y) : 99, c];
  }).sort((a, b) => a[0] - b[0]).map((x) => x[1]).filter((c) => !(c.battle && !c.battle.done));
  if (armyMen < desired && sustain('food') && sustain('gold') && front.length) {
    const w = Object.assign({}, F.mix);
    const near = hostileArmies.filter((h) => mine.some((c) => Math.hypot(h.x - c.x, h.y - c.y) < 30));
    const ec = emptyComp(); for (const h of near) for (const t of TYPES5) ec[t] += h.comp[t];
    const em = menOf(ec);
    if (em > 0) {
      const good = sigOf(F.id).good;   // what its own elite unit is good against
      if (ec.cav / em > 0.28) { w.spear += 0.35; if (good.includes('cav')) w.leg += 0.2; }
      if (ec.arch / em > 0.3) { w.cav += 0.25; if (good.includes('arch')) w.leg += 0.15; }
      if (ec.spear / em > 0.4) { if (good.includes('spear')) w.leg += 0.25; else w.arch += 0.15; }
      if (ec.leg / em > 0.35) { w.arch += 0.2; if (good.includes('leg')) w.leg += 0.15; }
    }
    const roll = (list) => { let sw = list.reduce((s, t) => s + w[t], 0), r = rnd() * sw; for (const t of list) { r -= w[t]; if (r <= 0) return t; } return list[0]; };
    const urgent = armyMen < desired * 0.35 || mine.some((c) => (c.battle && !c.battle.done) || threatOf(c).some((h) => h.target && h.target.ref === c));
    // once it has decided on its elite unit, the power saves up for it (for up to 40 s) unless a city is under attack
    let pick = F.saveFor && F.saveUntil > GS.time && !urgent ? 'leg' : roll(['spear', 'leg', 'arch', 'cav']);
    if (!canAfford(F, unitCost(pick, F.id))) {
      if (pick === 'leg' && !urgent && (F.saveUntil > GS.time || !(F.saveCool > GS.time))) { if (!(F.saveUntil > GS.time)) { F.saveFor = 'leg'; F.saveUntil = GS.time + 40; F.saveCool = GS.time + 70; } pick = null; }
      else { const opts = ['spear', 'leg', 'arch', 'cav'].filter((t) => canAfford(F, unitCost(t, F.id))); pick = opts.length ? roll(opts) : null; }
    } else if (pick === 'leg') F.saveFor = null;
    if (pick) {
      const city = front.find((c) => c.queue.length < 2);
      if (city) recruit(F, city, pick);
    }
  }
  // siege engines for the main army
  const main = armies.slice().sort((a, b) => menOf(b.comp) - menOf(a.comp))[0];
  if (main && menOf(main.comp) > 900 && main.comp.siege < 2 && F.res.wood > 300 && F.res.stone > 160 && front[0] && front[0].queue.length < 2 && canAfford(F, unitCost('siege', F.id))) recruit(F, front[0], 'siege');
  // forts
  if (warsOf(F.id) && F.res.stone > 450 && GS.forts.filter((f) => f.owner === F.id).length < Math.min(3, 1 + Math.floor(majors.length / 2)) && majors.length) {
    const c = front[0] || majors[0];
    const e = nearestCity(c.x, c.y, (o) => o.owner >= 0 && atWar(F.id, o.owner) && o.major);
    if (e) {
      const ang = Math.atan2(e.x - c.x, e.y - c.y);
      for (let d = 7; d >= 4; d--) { const x = c.x + Math.sin(ang) * d, y = c.y + Math.cos(ang) * d; if (fortSpotOk(F.id, x, y) && canAfford(F, fortCost(F.id))) { buildFort(F, x, y); break; } }
    }
  }

  // --- consolidate armies standing together
  for (const a of armies) {
    if (a.dead || a.state !== 'idle') continue;
    for (const b of armies) {
      if (b === a || b.dead || b.state !== 'idle' || dist(a, b) > 2.4) continue;
      if (menOf(b.comp) > menOf(a.comp)) continue;
      mergeArmies(a, b);
    }
  }
  // --- military
  for (const a of armies) {
    if (a.dead) continue;
    if (a.state === 'battle') {
      if (canRetreat(a)) {
        const B = a.battle, si = retreatSide(a), mine = sideMen(B.sides[si]), theirs = sideMen(B.sides[1 - si]);
        const heavy = B.round >= 4 && mine < theirs * (0.5 - 0.15 * F.aggr) && menOf(a.comp) > 120;
        if (heavy) retreatArmy(a);
      }
      continue;
    }
    if (a.state === 'rout') continue;
    const men = menOf(a.comp);
    if (a.state === 'move' && a.target && a.aiCommit > GS.time) {
      // call off a march on an army that has turned out too strong
      if (a.target.kind === 'army' && !a.target.ref.dead && estimateOdds([a], { kind: 'army', ref: a.target.ref }, 5, F.id).p < 0.3) { a.aiCommit = 0; a.path = null; a.target = null; a.state = 'idle'; }
      else continue;
    }
    // reinforce a friendly army that is fighting nearby
    let helped = false;
    for (const B of GS.battles) {
      if (B.done || B.sides[0].armies.includes(a) || B.sides[1].armies.includes(a)) continue;
      const si = B.sides[0].faction === F.id ? 0 : B.sides[1].faction === F.id ? 1 : -1;
      if (si < 0) continue;
      const d = Math.hypot(a.x - B.x, a.y - B.y);
      if (d > 24 || d < 2.4) continue;
      const foe = B.sides[1 - si].armies.find((x) => !x.dead);
      const mineP = powerOf(sideComp(B.sides[si]), F.id) + powerOf(a.comp, F.id), theirP = foe ? powerOf(sideComp(B.sides[1 - si]), foe.owner) + (B.sides[1 - si].militia ? B.sides[1 - si].militia.men * 0.7 : 0) : 1e9;
      if (mineP < theirP * 0.85) continue;
      if (foe) orderTarget(a, 'army', foe); else if (si === 0 && B.place) orderTarget(a, 'city', B.place); else continue;
      a.stance = 'aggr'; a.aiCommit = GS.time + 8; helped = true; break;
    }
    if (helped) continue;
    // defend threatened cities
    let defended = false;
    for (const c of mine) {
      const th = threatOf(c).filter((h) => h.target && (h.target.ref === c || h.target.kind === 'army'));
      if (!th.length) continue;
      const h = th.sort((p, q) => dist(p, c) - dist(q, c))[0];
      if (dist(a, c) > 30) continue;
      const o = estimateOdds([a], { kind: 'army', ref: h }, 6, F.id);
      if (o.p >= 0.55) { orderTarget(a, 'army', h); a.stance = 'aggr'; a.aiCommit = GS.time + 6; defended = true; break; }
      else if (dist(a, c) > 1.8 && dist(a, c) < 20) { orderTarget(a, 'city', c); a.stance = 'def'; a.aiCommit = GS.time + 6; defended = true; break; }
    }
    // hunt raiders plundering our provinces
    if (!defended) {
      const raider = hostileArmies.filter((h) => h.state !== 'battle' && provAt(h.x, h.y) >= 0 && holdsIn(MAP.provinces[provAt(h.x, h.y)], F.id) && dist(a, h) < 26).sort((p, q) => dist(p, a) - dist(q, a))[0];
      if (raider && estimateOdds([a], { kind: 'army', ref: raider }, 6, F.id).p >= 0.6) { orderTarget(a, 'army', raider); a.stance = 'aggr'; a.aiCommit = GS.time + 8; defended = true; }
    }
    if (defended) continue;
    // merge small armies
    if (men < 450) {
      const big = armies.filter((b) => b !== a && !b.dead && b.state !== 'battle' && b.state !== 'rout' && menOf(b.comp) >= men && dist(a, b) < 35).sort((p, q) => dist(p, a) - dist(q, a))[0];
      if (big) { orderTarget(a, 'merge', big); a.aiCommit = GS.time + 10; continue; }
    }
    // offense: cities, and the enemy forts that stand in the way of a province
    if (men >= 450) {
      const cands = [];
      const ratioOf = (defPow) => powerOf(a.comp, F.id) / Math.max(1, defPow * 1.2);
      for (const c of MAP.cities) {
        if (c.owner === F.id) continue;
        if (c.owner !== NEUTRAL && atPeace(F.id, c.owner)) continue;
        const d = dist(a, c); if (d > 60) continue;
        const ganged = gang && c.owner >= 0 ? (c.owner === topF.id ? 1 + gang : 1 - 0.25 * Math.min(1, gang)) : 1;
        const value = (c.major ? 3.2 : 1.7) * (c.owner === NEUTRAL ? 1.15 : 1) * (c.owner >= 0 && GS.factions[c.owner].isPlayer ? 1 + F.aggr * 0.3 : 1) * (c.capital ? 1.4 : 1) * provValue(MAP.provinces[c.prov], c) * ganged * (1 + 0.12 * (c.imps ? c.imps.length : 0));
        const ratio = ratioOf(cityEstimate(F.id, c).militia * (1 + COMBAT.wallDef * Math.max(0, c.walls - Math.floor(a.comp.siege / 2))));   // what it believes defends the city
        if (ratio < 0.7) continue;
        cands.push({ ref: c, kind: 'city', d, value, pre: value * Math.min(ratio, 3) / (d + 12) });
      }
      for (const f of GS.forts) {
        if (f.dead || f.built < 1 || f.owner === F.id || !atWar(F.id, f.owner)) continue;
        const p = fortProv(f); if (p < 0 || !holdsIn(MAP.provinces[p], F.id)) continue;   // only forts in provinces it has a stake in
        const d = dist(a, f); if (d > 60) continue;
        const value = AI_PROV.fort * provValue(MAP.provinces[p], f);
        const ratio = ratioOf(BUILD.fort.max * (1 + COMBAT.wallDef * Math.max(0, BUILD.fort.walls - Math.floor(a.comp.siege / 2))));
        if (ratio < 0.7) continue;
        cands.push({ ref: f, kind: 'fort', d, value, pre: value * Math.min(ratio, 3) / (d + 12) });
      }
      cands.sort((p, q) => q.pre - p.pre);
      let best = null, bestKind = null, bs = 0;
      for (const k of cands.slice(0, 4)) {
        const o = estimateOdds([a], { kind: k.kind, ref: k.ref }, 7, F.id);
        const need = AI_PROV.need - 0.18 * F.aggr + diffOf().need;
        if (o.p < need) continue;
        const s = k.value * o.p / (k.d + 12);
        if (s > bs) { bs = s; best = k.ref; bestKind = k.kind; }
      }
      // opportunistic strike on a nearby weaker army
      for (const h of hostileArmies) {
        if (dist(a, h) > 18 || h.state === 'battle') continue;
        if (atPeace(F.id, h.owner)) continue;
        const o = estimateOdds([a], { kind: 'army', ref: h }, 6, F.id);
        if (o.p > 0.75) { const s = 2.5 * o.p / (dist(a, h) + 8); if (s > bs) { bs = s; best = h; bestKind = 'army'; } }
      }
      if (best) {
        orderTarget(a, bestKind, best);
        a.stance = 'aggr'; a.aiCommit = GS.time + 14;
        continue;
      }
      // not strong enough alone: fall in behind a bigger friendly army and attack together
      const mate = armies.filter((b) => b !== a && !b.dead && b.state !== 'battle' && b.state !== 'rout' && !(b.target && b.target.kind === 'merge') && (menOf(b.comp) > men || (menOf(b.comp) === men && b.id < a.id)) && dist(a, b) < 40 && menOf(b.comp) + men < 2800).sort((p, q) => dist(p, a) - dist(q, a))[0];
      if (mate && dist(a, mate) > 3) { orderTarget(a, 'merge', mate); a.aiCommit = GS.time + 10; continue; }
    }
    // otherwise rest at the nearest major city
    if (a.state === 'idle') {
      const home = nearestCity(a.x, a.y, (c) => c.owner === F.id && c.major);
      if (home && dist(a, home) > 2.5) { orderTarget(a, 'city', home); a.aiCommit = GS.time + 8; }
      a.stance = 'def';
    }
  }
}
