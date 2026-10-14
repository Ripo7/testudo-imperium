import { cityEstimate, fogRules, knowsArmy } from './sight.js';
import { atPeace, atWar, declareWar, relOf } from './diplomacy.js';
import { SET_W } from './standing.js';
import { angDiff, cellOf, cloneComp, dist, emptyComp, GS, MAP, menOf, rnd, rndIn, starsOf } from './state.js';
import { BIOME, BIOME_NAME, rng32 } from '../map/generate.js';
import { updateTerrainColors } from '../render/terrain.js';
import { refreshCityMesh, removeFortMesh } from '../render/cities.js';
import { BALN, FORT_WALLS, K_DMG, NEUTRAL, ROUND_T, sigOf, TERRAIN_DEF, TW_CAV, TW_DEF, TYPES5, UNITS, VS } from './data.js';
import { militiaMaxOf } from './campaign.js';
import { findPath, nearestCity } from './armies.js';
import { ME } from '../ui/state.js';
import { log, onBattleEnd, onBattleStart, onCityCaptured } from '../ui/hud.js';
import { recordBattle, recordCapture } from './chronicle.js';

/* =========================================================
   Battles
   ========================================================= */
export function mkSide(faction, armies, militia) {
  const s = { faction, armies: armies.slice(), militia, start: 0 };
  s.start = sideMen(s);
  return s;
}
// an army's weight in a battle: its men, and 8 for every siege engine
export const armyMen = (a) => menOf(a.comp) + a.comp.siege * 8;
export function sideMen(s) { let m = 0; for (const a of s.armies) m += armyMen(a); if (s.militia) m += s.militia.men; return m; }
// what a side has committed (S.start grows as reinforcements join) less what got away by retreating
export const sideFought = (S) => S.start - (S.left || 0);
// men a side has lost so far: everyone who fought for it, less those still standing
export const sideLosses = (S) => Math.max(0, sideFought(S) - sideMen(S));
export function sideComp(s) {
  const c = emptyComp();
  for (const a of s.armies) for (const t of TYPES5) c[t] += a.comp[t];
  if (s.militia) { c.spear += s.militia.men * s.militia.sp; c.arch += s.militia.men * (1 - s.militia.sp); }
  return c;
}
export function battleWalls(B) {
  if (B.kind === 'field') return 0;
  const w = B.kind === 'city' ? B.place.walls : FORT_WALLS;
  let siege = 0; for (const a of B.sides[0].armies) siege += a.comp.siege;
  return Math.max(0, w - Math.floor(siege / 2));
}
export function sideMods(B, si) {
  const S = B.sides[si], isAtt = si === 0;
  let w = 0, sAtk = 0, sDef = 0, legs = 0, testudoLegs = 0;
  for (const a of S.armies) {
    const m = menOf(a.comp) + a.comp.siege * 8, v = 1 + 0.07 * starsOf(a);
    sAtk += m * v * (a.stance === 'aggr' ? 1.12 : 0.92);
    sDef += m * v * (a.stance === 'def' ? 1.22 : 0.95);
    w += m; legs += a.comp.leg; if (a.stance === 'def') testudoLegs += a.comp.leg;
  }
  if (S.militia) { sAtk += S.militia.men * 0.9; sDef += S.militia.men; w += S.militia.men; }
  const SG = sigOf(S.faction);
  const M = { atk: w ? sAtk / w : 1, def: w ? sDef / w : 1, cav: 1, arch: 1, sig: 1, testudo: !!SG.testudo && legs > 0 && testudoLegs / legs > 0.5 };
  if (SG.home && SG.home.includes(MAP.biome[cellOf(B.x, B.y)])) M.sig *= 1.25;
  if (isAtt) {
    if (B.river && B.dugIn) M.atk *= 0.8;
    if (B.flank) M.atk *= 1.25;
    if (B.kind !== 'field' || B.rough) M.cav *= 0.6;
    if (B.kind !== 'field' && SG.assault) M.sig *= SG.assault;
    if (B.kind === 'field' && B.rough && SG.rough) M.sig *= SG.rough;
  } else {
    if (B.kind === 'field' && B.dugIn) M.def *= B.terrainDef;
    if (B.kind !== 'field') { const L = battleWalls(B); M.def *= 1 + 0.45 * L; M.arch *= 1 + 0.3 * L; }
  }
  return M;
}
export function battleRound(B, rng, noise) {
  const phase = B.round < BALN.rr ? 0 : B.round === BALN.rr ? 1 : 2;
  const comps = [sideComp(B.sides[0]), sideComp(B.sides[1])];
  const mods = [sideMods(B, 0), sideMods(B, 1)];
  const loss = [emptyComp(), emptyComp()];
  for (let s = 0; s < 2; s++) {
    const o = 1 - s, A = comps[s], D = comps[o], M = mods[s], MD = mods[o];
    const SA = sigOf(B.sides[s].faction), SD = sigOf(B.sides[o].faction);   // each side's elite unit
    const nz = (noise ? 0.82 + rng() * 0.36 : 1) * (B.luck ? B.luck[s] : 1);
    for (const a of TYPES5) {
      const n = A[a]; if (n <= 0) continue;
      let p, shot = a === 'arch';
      if (a === 'arch') p = n * (phase === 0 ? BALN.archR : BALN.archM);
      else if (a === 'leg') {
        if (phase === 0) { if (!SA.shoot) continue; p = n * SA.shoot; shot = true; }
        else p = n * SA.atk * (phase === 1 ? SA.charge : 1);
      }
      else if (phase === 0) continue;
      else if (a === 'siege') p = n * UNITS.siege.atk;
      else p = n * UNITS[a].atk * (a === 'cav' ? (phase === 1 ? 1.8 : 1) * (D.cav < menOf(D) * 0.1 ? 1.25 : 1) : 1);
      p *= M.atk * nz * (a === 'cav' ? M.cav : 1) * (a === 'arch' ? M.arch : 1) * (a === 'leg' ? M.sig : 1);
      const TW = shot ? null : a === 'cav' || (a === 'leg' && SA.tw === 'cav') ? TW_CAV : TW_DEF;
      let sw = 0; const ws = {};
      for (const t of TYPES5) {
        if (D[t] <= 0) continue;
        let tw = TW ? TW[t] : (t === 'siege' ? 0.5 : 1);
        if (TW === TW_CAV && t === 'leg' && SD.cavShy) tw = SD.cavShy;          // horses shy away from elephants
        const w = (t === 'siege' ? D[t] * 10 : D[t]) * tw;
        ws[t] = w; sw += w;
      }
      if (sw <= 0) continue;
      const vs = a === 'leg' ? SA.vs : VS[a];
      for (const t in ws) {
        // elite against elite: the four form a cycle (SIG.beats), otherwise the usual matchup table
        const mult = a === 'leg' && t === 'leg' ? (SA.beats === SD.key ? SA.beatsBy : SD.beats === SA.key ? 1 / SD.beatsBy : 1) : ((vs && vs[t]) || 1);
        let dmg = p * ws[t] / sw * mult * K_DMG;
        if (t === 'leg') {
          dmg *= SD.hurt[shot ? 'shot' : a] || 1;
          if (shot && MD.testudo) dmg *= 0.45;
        }
        loss[o][t] += dmg / ((t === 'leg' ? SD.hp : UNITS[t].hp) * MD.def);
      }
    }
  }
  for (let s = 0; s < 2; s++) applyLoss(B.sides[s], comps[s], loss[s]);
  B.round++;
}
export function applyLoss(S, total, loss) {
  for (const t of TYPES5) {
    const L = Math.min(loss[t], total[t]);
    if (L <= 0 || total[t] <= 0) continue;
    const k = L / total[t];
    for (const a of S.armies) a.comp[t] = Math.max(0, a.comp[t] - a.comp[t] * k);
    if (S.militia && (t === 'spear' || t === 'arch')) {
      const part = S.militia.men * (t === 'spear' ? S.militia.sp : 1 - S.militia.sp);
      S.militia.men = Math.max(0, S.militia.men - part * k);
    }
  }
}
export function sideBroken(S) {
  const men = sideMen(S);
  if (men < 6) return true;
  if (S.militia && S.militia.men > 3) return false;   // city/fort defenders fight to the end
  let stars = 0, w = 0;
  for (const a of S.armies) { const m = menOf(a.comp); stars += starsOf(a) * m; w += m; }
  const thr = 0.5 + 0.06 * (w ? stars / w : 0);
  return 1 - men / Math.max(1, S.start) >= thr;
}

export function battleSetup(B) {
  const att = B.sides[0], def = B.sides[1];
  const cell = cellOf(B.x, B.y);
  const b = MAP.biome[cell];
  B.terrainDef = TERRAIN_DEF[b] || 1;
  B.rough = b === BIOME.FOREST || b === BIOME.MOUNTAIN || b === BIOME.SNOW;
  B.river = false;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (MAP.river[cellOf(B.x + dx, B.y + dy)]) B.river = true;
  B.dugIn = B.kind !== 'field' || def.armies.every((a) => a.state === 'idle' || a.state === 'battle');
  B.flank = false;
  const angs = att.armies.map((a) => Math.atan2(a.x - B.x, a.y - B.y));
  for (let i = 0; i < angs.length; i++) for (let j = i + 1; j < angs.length; j++) if (Math.abs(angDiff(angs[i], angs[j])) > 1.4) B.flank = true;
}
export function modsList(B, forSide) {
  const L = [];
  const W = battleWalls(B);
  if (B.kind !== 'field') {
    const base = B.kind === 'city' ? B.place.walls : FORT_WALLS;
    if (base) L.push([`Walls ${base}${W < base ? ' (siege: ' + W + ')' : ''}`, W ? `defense +${Math.round(45 * W)}%` : 'breached', 1]);
  } else if (B.dugIn && B.terrainDef > 1) L.push([BIOME_NAME[MAP.biome[cellOf(B.x, B.y)]], `defense +${Math.round((B.terrainDef - 1) * 100)}%`, 1]);
  if (B.river && B.dugIn) L.push(['River crossing', 'attack −20%', 0]);
  if (B.flank) L.push(['Flanking', 'attack +25%', 0]);
  if (B.kind !== 'field' || B.rough) L.push([B.kind !== 'field' ? 'Assault' : 'Rough ground', 'cavalry −40%', 0]);
  // the elite units' own conditions
  const bio = MAP.biome[cellOf(B.x, B.y)];
  B.sides.forEach((S, si) => {
    const SG = sigOf(S.faction);
    if (S.faction < 0 || !S.armies.some((a) => a.comp.leg > 0)) return;
    if (SG.home && SG.home.includes(bio)) L.push([`${SG.name} on home ground`, 'attack +25%', si]);
    if (si === 0 && B.kind !== 'field' && SG.assault) L.push([`${SG.name} storming walls`, `attack −${Math.round((1 - SG.assault) * 100)}%`, 0]);
    if (si === 0 && B.kind === 'field' && B.rough && SG.rough) L.push([`${SG.name} on rough ground`, `attack −${Math.round((1 - SG.rough) * 100)}%`, 0]);
  });
  return L;
}

export function startBattle(kind, attArmies, defArmies, place, x, y) {
  const defFaction = kind === 'field' ? defArmies[0].owner : place.owner;
  let militia = null;
  if (kind === 'city') militia = { men: place.militia, sp: 0.7, ref: place };
  if (kind === 'fort') militia = { men: place.militia, sp: 0.5, ref: place };
  // nearby friends join
  const att = attArmies.slice(), def = defArmies.slice();
  for (const a of GS.armies) {
    if (a.dead || a.state === 'battle' || a.state === 'rout') continue;
    if (att.includes(a) || def.includes(a)) continue;
    const d = Math.hypot(a.x - x, a.y - y);
    if (a.owner === defFaction && defFaction !== NEUTRAL && d < 2.6) def.push(a);
    else if (a.owner === att[0].owner && d < 2.6 && (a.target && place && a.target.ref === place || a.state === 'idle')) att.push(a);
  }
  const B = { id: GS.nextId++, kind, place, x, y, round: 0, t: 0, done: false, luck: [rndIn(0.86, 1.14), rndIn(0.86, 1.14)], sides: [mkSide(att[0].owner, att, null), mkSide(defFaction, def, militia)] };
  B.sides[1].start = sideMen(B.sides[1]);
  for (const a of att.concat(def)) { if (a.state === 'idle' || a.state === 'move') a.preState = a.state; }
  battleSetup(B);
  for (const a of att.concat(def)) { a.state = 'battle'; a.battle = B; }
  if (defFaction >= 0 && att[0].owner >= 0 && atPeace(att[0].owner, defFaction)) declareWar(att[0].owner, defFaction);
  for (const a of att) a.heading = Math.atan2(x - a.x, y - a.y);
  for (const a of def) a.heading = Math.atan2(att[0].x - a.x, att[0].y - a.y);
  GS.battles.push(B);
  onBattleStart(B);
  return B;
}
export function startSiege(att, place, kind) {
  if (place.battle && !place.battle.done) { // join an ongoing assault
    const B = place.battle;
    if (B.sides[0].faction === att[0].owner) { for (const a of att) { B.sides[0].armies.push(a); B.sides[0].start += armyMen(a); a.state = 'battle'; a.battle = B; } battleSetup(B); }
    return B;
  }
  const defArmies = GS.armies.filter((a) => !a.dead && a.owner === place.owner && place.owner !== NEUTRAL && a.state !== 'battle' && a.state !== 'rout' && Math.hypot(a.x - place.x, a.y - place.y) < 2.6);
  const B = startBattle(kind, att, defArmies, place, place.x, place.y);
  place.battle = B;
  return B;
}

export function updateBattles(dt) {
  for (const B of GS.battles) {
    if (B.done) continue;
    // reinforcements arriving
    for (const a of GS.armies) {
      if (a.dead || a.state === 'battle' || a.state === 'rout') continue;
      if (Math.hypot(a.x - B.x, a.y - B.y) > 2.4) continue;
      const si = a.owner === B.sides[0].faction ? 0 : a.owner === B.sides[1].faction ? 1 : -1;
      if (si < 0) continue;
      B.sides[si].armies.push(a); B.sides[si].start += armyMen(a);
      a.state = 'battle'; a.battle = B; a.heading = Math.atan2(B.x - a.x, B.y - a.y);
      battleSetup(B);
    }
    B.t += dt;
    while (B.t >= ROUND_T && !B.done) {
      B.t -= ROUND_T;
      battleRound(B, rnd, true);
      if (B.place && B.place.militia != null && B.sides[1].militia) B.place.militia = B.sides[1].militia.men;
      const br0 = sideBroken(B.sides[0]), br1 = sideBroken(B.sides[1]);
      if (br0 || br1 || B.round > 60) endBattle(B, br1 && !br0 ? 0 : br0 && !br1 ? 1 : (br0 && br1 && sideMen(B.sides[0]) / B.sides[0].start > sideMen(B.sides[1]) / B.sides[1].start ? 0 : 1));
    }
  }
  GS.battles = GS.battles.filter((B) => !B.done || (GS.time - B.endT) < 3);
}
export function endBattle(B, winner) {
  const f0 = B.sides[0].faction, f1 = B.sides[1].faction;
  if (atWar(f0, f1)) {
    const R = relOf(f0, f1);
    for (let i = 0; i < 2; i++) {
      const f = B.sides[i].faction, lost = sideLosses(B.sides[i]);
      const left = GS.armies.reduce((m, a) => m + (!a.dead && a.owner === f ? menOf(a.comp) : 0), 0);
      R.w[f] = (R.w[f] || 0) + lost / Math.max(500, lost + left) * 0.6;
      R.sc[B.sides[1 - i].faction] = (R.sc[B.sides[1 - i].faction] || 0) + lost / 400;
    }
  }
  B.done = true; B.endT = GS.time; B.winner = winner;
  const W = B.sides[winner], L = B.sides[1 - winner];
  const wComp = sideComp(W), wMen = menOf(wComp);
  const riders = wComp.cav + (sigOf(W.faction).mounted ? wComp.leg : 0);
  const pursuit = wMen > 0 ? Math.min(0.25, (riders / wMen) * 0.6) : 0;
  for (const a of W.armies) {
    if (menOf(a.comp) < 5 && a.comp.siege < 1) { a.dead = true; continue; }
    a.wins++; a.state = 'idle'; a.battle = null;
    roundComp(a);
    if (a.target && a.target.kind === 'army' && (a.target.ref.dead || L.armies.includes(a.target.ref))) a.target = null;
  }
  for (const a of L.armies) {
    a.battle = null;
    for (const t of TYPES5) a.comp[t] *= 1 - pursuit;
    roundComp(a);
    if (menOf(a.comp) < 15) { a.dead = true; continue; }
    rout(a, B);
  }
  if (B.place) B.place.battle = null;
  if (B.kind === 'city') {
    if (winner === 0) captureCity(B.place, B.sides[0].faction);
    else B.place.militia = Math.max(B.place.militia, 0);
  } else if (B.kind === 'fort') {
    if (winner === 0) { B.place.dead = true; removeFortMesh(B.place); GS.forts = GS.forts.filter((f) => f !== B.place); }
  }
  B.lost = B.sides.map((S) => Math.round(sideLosses(S)));   // the pursuit included: what the chronicle, the stats and the messages report
  recordBattle(B);
  onBattleEnd(B);
}
export function roundComp(a) { for (const t of ['spear', 'leg', 'arch', 'cav']) a.comp[t] = Math.round(a.comp[t]); a.comp.siege = Math.floor(a.comp.siege + 0.3); }
export function rout(a, B) {
  a.state = 'rout'; a.routT = 6; a.target = null;
  const home = nearestCity(a.x, a.y, (c) => c.owner === a.owner && !(c.battle && !c.battle.done));
  if (home) a.path = findPath(a.x, a.y, home.x + 1, home.y + 1, a.owner);
  else {
    const ang = Math.atan2(a.x - B.x, a.y - B.y);
    a.path = findPath(a.x, a.y, a.x + Math.sin(ang) * 10, a.y + Math.cos(ang) * 10, a.owner);
  }
  a.pi = 0; a.pathVersion++;
  if (!a.path) { a.state = 'idle'; a.routT = 0; }
}
export function captureCity(c, f) {
  const prev = c.owner;
  recordCapture(c, prev, f);
  if (atWar(prev, f)) { const R = relOf(prev, f), k = SET_W(c); R.lc = R.lc || {}; R.lc[f] = GS.time; R.sc[f] = (R.sc[f] || 0) + k; R.w[prev] = (R.w[prev] || 0) + 0.07 * k; R.w[f] = Math.max(0, (R.w[f] || 0) - 0.03 * k); }
  c.owner = f; c.walls = Math.max(0, c.walls - 1); c.wallBuild = null; c.queue = [];
  c.impBuild = null; if (c.imps.length) c.imps.pop();   // the last building is looted
  c.militiaMax = militiaMaxOf(c); c.militia = c.militiaMax * 0.35; c.loyal = 0.3;
  if (c.major) { MAP.provinces[c.prov].owner = f; updateTerrainColors(); }
  refreshCityMesh(c);
  onCityCaptured(c, prev, f);
}

export function detectContacts() {
  const A = GS.armies;
  for (let i = 0; i < A.length; i++) {
    const a = A[i];
    if (a.dead || a.state === 'battle' || a.state === 'rout') continue;
    for (let j = i + 1; j < A.length; j++) {
      const b = A[j];
      if (b.dead || b.owner === a.owner || b.state === 'battle' || b.state === 'rout') continue;
      if (atPeace(a.owner, b.owner) && !(a.target && a.target.ref === b) && !(b.target && b.target.ref === a)) continue;   // the truce holds: they march past each other
      if (Math.abs(a.x - b.x) > 1.4 || Math.abs(a.y - b.y) > 1.4 || dist(a, b) > 1.35) continue;
      let att = a, def = b;
      if (b.target && b.target.ref === a) { att = b; def = a; }
      else if (!(a.target && a.target.ref === b) && a.state !== 'move' && b.state === 'move') { att = b; def = a; }
      startBattle('field', [att], [def], null, (a.x + b.x) / 2, (a.y + b.y) / 2);
      break;
    }
    if (a.state === 'battle') continue;
    // forts block the way
    for (const f of GS.forts) {
      if (f.dead || f.owner === a.owner || f.built < 1) continue;
      if (atPeace(a.owner, f.owner) && !(a.target && a.target.ref === f)) continue;
      if (Math.hypot(f.x - a.x, f.y - a.y) < 1.1) { startSiege([a], f, 'fort'); break; }
    }
  }
}

/* ---------- odds ---------- */
// view: the power whose knowledge counts (under the fog it only counts the defenders it can see, and
// judges an unseen city by its last report); null or undefined: the true odds
export function estimateOdds(attArmies, T, sims, view) {
  sims = sims || 14;
  const fogView = view != null && view >= 0 && fogRules();
  const fake = (a) => ({ comp: cloneComp(a.comp), stance: a.stance, wins: a.wins, x: a.x, y: a.y, state: a.state, owner: a.owner, siegeOnly: 0 });
  let kind = 'field', place = null, defs = [], x, y;
  if (T.kind === 'army') { defs = [T.ref]; x = T.ref.x; y = T.ref.y; }
  else { kind = T.kind; place = T.ref; x = place.x; y = place.y; }
  const defOwner = kind === 'field' ? T.ref.owner : place.owner;
  for (const a of GS.armies) if (!a.dead && a.state !== 'rout' && a.owner === defOwner && defOwner !== NEUTRAL && !defs.includes(a) && Math.hypot(a.x - x, a.y - y) < 2.6 && (!fogView || knowsArmy(view, a))) defs.push(a);
  let milMen = place ? place.militia : 0;
  if (fogView && kind === 'city') {
    const e = cityEstimate(view, place);
    if (!e.known) {
      milMen = e.militia;
      if (e.garrison > 0) defs.push({ comp: { spear: e.garrison, leg: 0, arch: 0, cav: 0, siege: 0 }, stance: 'def', wins: 0, x, y, state: 'idle', owner: defOwner });
    }
  }
  const rng = rng32(Math.floor(GS.time * 10) + attArmies[0].id * 7);
  let wins = 0, attLeft = 0;
  const att0 = attArmies.reduce((s, a) => s + menOf(a.comp), 0);
  let modsOut = null;
  for (let k = 0; k < sims; k++) {
    const A = attArmies.map(fake), D = defs.map(fake);
    for (const d of D) if (T.kind === 'army' && d.state !== 'move') d.state = 'idle';
    const mil = kind === 'city' ? { men: milMen, sp: 0.7 } : kind === 'fort' ? { men: place.militia, sp: 0.5 } : null;
    const B = { kind, place: place ? { walls: place.walls, owner: place.owner } : null, x, y, round: 0, luck: [0.86 + rng() * 0.28, 0.86 + rng() * 0.28], sides: [mkSide(attArmies[0].owner, A, null), mkSide(defOwner, D, mil)] };
    battleSetup(B);
    if (!modsOut) modsOut = modsList(B);
    let w = 1;
    for (let r = 0; r < 61; r++) {
      battleRound(B, rng, true);
      const b0 = sideBroken(B.sides[0]), b1 = sideBroken(B.sides[1]);
      if (b0 || b1) { w = b1 && !b0 ? 0 : b0 && !b1 ? 1 : (sideMen(B.sides[0]) / B.sides[0].start > sideMen(B.sides[1]) / B.sides[1].start ? 0 : 1); break; }
    }
    if (w === 0) wins++;
    attLeft += sideMen(B.sides[0]);
  }
  return { p: wins / sims, attLoss: Math.max(0, att0 - attLeft / sims), mods: modsOut || [] };
}
export function powerOf(comp, f) { return comp.spear * 1 + comp.leg * sigOf(f).power + comp.arch * 1.1 + comp.cav * 2.6 + comp.siege * 5; }
// Retreat: an army pulls out of a battle it is losing. It keeps the rest, minus what the pursuit cuts down.
export function retreatSide(a) { const B = a.battle; if (!B || B.done) return -1; return B.sides[0].armies.includes(a) ? 0 : B.sides[1].armies.includes(a) ? 1 : -1; }
export function canRetreat(a) {
  const B = a.battle, si = retreatSide(a);
  if (si < 0 || B.round < 2) return false;
  return si === 0 || B.kind === 'field';   // defenders cannot abandon their walls
}
export function retreatLoss(a) {
  const B = a.battle, si = retreatSide(a);
  const foe = sideComp(B.sides[1 - si]), fm = Math.max(1, menOf(foe));
  const fr = (foe.cav + (sigOf(B.sides[1 - si].faction).mounted ? foe.leg : 0)) / fm;
  const m = Math.max(1, menOf(a.comp)), my = (a.comp.cav + (sigOf(a.owner).mounted ? a.comp.leg : 0)) / m;
  return Math.max(0.06, Math.min(0.4, 0.12 + fr * 0.5 - Math.min(0.06, my * 0.2)));
}
export function retreatArmy(a) {
  if (!canRetreat(a)) return false;
  const B = a.battle, si = retreatSide(a), S = B.sides[si], loss = retreatLoss(a);
  S.armies = S.armies.filter((x) => x !== a);
  for (const t of ['spear', 'leg', 'arch', 'cav']) a.comp[t] *= 1 - loss;
  a.comp.siege *= 0.5;
  roundComp(a); a.battle = null; a.retreated = true;
  S.left = (S.left || 0) + armyMen(a);   // they got away: not counted as losses
  if (menOf(a.comp) < 15) a.dead = true; else { rout(a, B); a.routT = 4; }
  if (a.owner === ME && !GS.auto) log(`Our army <b>retreats</b>, losing ${Math.round(loss * 100)}% to the pursuit.`, 'info', a);
  const empty = !S.armies.length && !(si === 1 && S.militia);
  if (empty) endBattle(B, 1 - si); else battleSetup(B);
  return true;
}
