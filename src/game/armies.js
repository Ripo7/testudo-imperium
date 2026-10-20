import { knowsArmy } from './sight.js';
import { atPeace } from './diplomacy.js';
import { cellOf, dist, emptyComp, GS, MAP, menOf } from './state.js';
import { clamp, dampAngle, sinCos } from '../core/math.js';
import { BIOME, BIOME_NAME, Heap, MOVE, N8 } from '../map/generate.js';
import { BASE_SPEED, sigOf, TYPES5 } from './data.js';
import { startSiege } from './battles.js';
import { HOOKS } from './hooks.js';

/* =========================================================
   Armies
   ========================================================= */
export function makeArmy(owner, comp, x, y) {
  const a = {
    id: GS.nextId++, owner, comp: Object.assign(emptyComp(), comp), x, y, heading: 0,
    path: null, pi: 0, pathVersion: 0, target: null, stance: 'aggr', state: 'idle', routT: 0, wins: 0,
    battle: null, dead: false, repathT: 0, layout: null, layoutKey: '', lastPos: { x, y },
  };
  const near = nearestCity(x, y, (c) => c.owner !== owner);
  if (near) a.heading = Math.atan2(near.x - x, near.y - y);
  GS.armies.push(a);
  return a;
}
export function nearestCity(x, y, pred) {
  let best = null, bd = Infinity;
  for (const c of MAP.cities) { if (pred && !pred(c)) continue; const d = Math.hypot(c.x - x, c.y - y); if (d < bd) { bd = d; best = c; } }
  return best;
}
// cells per second, from the army's make-up and the ground under it (MAP.move, see map/generate.js)
export function armySpeed(a) { return speedAt(a, cellOf(a.x, a.y), a.x, a.y); }
// the same, for army a standing on cell i at (x, y)
export function speedAt(a, i, x, y) {
  const c = a.comp, men = menOf(c);
  const mc = MAP.move[i], onRoad = MAP.road[i] === 1;
  const open = OPEN_GROUND.has(MAP.biome[i]);
  let s = BASE_SPEED;
  const SG = sigOf(a.owner);
  if (men > 0 && (c.cav + (SG.mounted ? c.leg : 0)) / men > 0.95) s *= onRoad || open ? 1.5 : 1.1;   // horsemen only outpace infantry on open ground
  if (c.leg > 0 && SG.slow) s *= SG.slow;
  if (c.siege > 0) s *= onRoad ? 0.85 : 0.6;   // engines crawl off the roads
  if (a.stance === 'def') s *= 0.85;
  if (a.state === 'rout') s *= 1.15;
  s /= Math.min(mc < Infinity ? mc : 3, 6);
  for (const f of GS.forts) if (f.owner !== a.owner && f.built >= 1 && Math.hypot(f.x - x, f.y - y) < 3.2) { s *= 0.45; break; }
  return s;
}
// about how many seconds army a needs to march along path (cell indices) from step pi on
export function pathTime(a, path, pi = 0) {
  if (!path) return 0;
  let t = 0, px = a.x, py = a.y;
  for (let k = pi; k < path.length; k++) {
    const i = path[k], x = i % MAP.W, y = (i / MAP.W) | 0;
    t += Math.hypot(x - px, y - py) / Math.max(0.05, speedAt(a, i, x, y));
    px = x; py = y;
  }
  return t;
}
// where an army marching along a path will be after each of the times in `at` (seconds from now, rising), as long as
// it is still on its way: [[x, y], ...] (the march alone: a battle on the road is not foreseen)
export function pathPointsAt(a, path, pi, at) {
  const out = [];
  if (!path) return out;
  let t = 0, px = a.x, py = a.y, j = 0;
  for (let k = pi; k < path.length && j < at.length; k++) {
    const i = path[k], x = i % MAP.W, y = (i / MAP.W) | 0;
    const dt = Math.hypot(x - px, y - py) / Math.max(0.05, speedAt(a, i, x, y));
    while (j < at.length && t + dt >= at[j]) { const f = dt > 0 ? (at[j] - t) / dt : 1; out.push([px + (x - px) * f, py + (y - py) * f]); j++; }
    t += dt; px = x; py = y;
  }
  return out;
}
// what the ground at (x, y) means for a marching army, in words
export function groundInfo(x, y) {
  const i = cellOf(clamp(x, 0, MAP.W - 1), clamp(y, 0, MAP.H - 1)), m = MAP.move[i];
  const wet = MAP.river[i] && MAP.elev[i] >= 0;
  const name = MAP.bridge[i] ? 'Bridge' : MAP.road[i] ? 'Road' : wet ? (MAP.ford[i] ? 'Ford' : 'River') : BIOME_NAME[MAP.biome[i]];
  const pace = !(m < Infinity) ? (wet ? 'no crossing here: find a bridge or a ford' : 'impassable')
    : m <= 0.75 ? 'fast march' : m <= 1.15 ? 'normal pace' : m <= 1.6 ? 'slower going' : m <= 2.6 ? 'slow going' : 'very slow going';
  return { name, pace, cost: m };
}
const OPEN_GROUND = new Set([BIOME.PLAINS, BIOME.STEPPE, BIOME.DESERT, BIOME.BEACH]);
export function splitArmy(a) {
  if (a.state === 'battle' || menOf(a.comp) < 100) return null;
  const half = emptyComp();
  for (const t of TYPES5) { half[t] = t === 'siege' ? Math.floor(a.comp[t] / 2) : Math.floor(a.comp[t] / 2 / 10) * 10; a.comp[t] -= half[t]; }
  const b = makeArmy(a.owner, half, a.x, a.y);
  b.stance = a.stance; b.wins = a.wins; b.heading = a.heading;
  const { s, c } = sinCos(a.heading + Math.PI / 2);
  const nx = a.x + s * 1.6, ny = a.y + c * 1.6;
  if (MAP.move[cellOf(nx, ny)] < Infinity) orderMove(b, nx, ny);
  return b;
}
export function mergeArmies(into, from) {
  for (const t of TYPES5) into.comp[t] += from.comp[t];
  into.wins = Math.max(into.wins, from.wins);
  from.dead = true; from.mergedInto = into;
  HOOKS.armiesMerged(into, from);
}

/* ---------- pathfinding (A* on the grid) ---------- */
export let PF = null;
export function resetPathfinder() { PF = null; }
export function pathfinder() {
  const N = MAP.W * MAP.H;
  PF = { g: new Float32Array(N), came: new Int32Array(N), stamp: new Uint32Array(N), closed: new Uint32Array(N), gen: 0 };
}
export function findPath(sx, sy, tx, ty, owner) {
  const W = MAP.W, H = MAP.H, cost = MAP.move;
  if (!PF) pathfinder();
  sx = clamp(Math.round(sx), 0, W - 1); sy = clamp(Math.round(sy), 0, H - 1);
  tx = clamp(Math.round(tx), 0, W - 1); ty = clamp(Math.round(ty), 0, H - 1);
  let start = sy * W + sx, goal = ty * W + tx;
  if (!(cost[goal] < Infinity)) {
    let best = -1, bd = Infinity;
    for (let r = 1; r <= 6 && best < 0; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const x = tx + dx, y = ty + dy; if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const i = y * W + x; if (cost[i] < Infinity) { const d = dx * dx + dy * dy; if (d < bd) { bd = d; best = i; } }
    }
    if (best < 0) return null;
    goal = best;
  }
  if (!(cost[start] < Infinity)) {
    for (const [dx, dy] of N8) { const i = (sy + dy) * W + sx + dx; if (cost[i] < Infinity) { start = i; break; } }
  }
  if (start === goal) return [goal];
  const gen = ++PF.gen, g = PF.g, came = PF.came, stamp = PF.stamp, closed = PF.closed;
  const gx = goal % W, gy = (goal / W) | 0;
  // octile distance at road speed: never overestimates, so paths really take the roads
  const hfun = (i) => { const dx = Math.abs(i % W - gx), dy = Math.abs(((i / W) | 0) - gy); return ((dx + dy) + (1.414 - 2) * Math.min(dx, dy)) * MOVE.road; };
  const heap = new Heap();
  stamp[start] = gen; g[start] = 0; came[start] = -1;
  heap.push(hfun(start), start);
  let found = false, iter = 0;
  while (heap.size && iter++ < 80000) {
    const c = heap.pop();
    if (closed[c] === gen) continue;
    closed[c] = gen;
    if (c === goal) { found = true; break; }
    const cx = c % W, cy = (c / W) | 0;
    for (let k = 0; k < 8; k++) {
      const dx = N8[k][0], dy = N8[k][1];
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const n = ny * W + nx;
      const cn = cost[n];
      if (!(cn < Infinity) || closed[n] === gen) continue;
      if (dx && dy && (!(cost[cy * W + nx] < Infinity) || !(cost[ny * W + cx] < Infinity))) continue;
      let step = cn * (dx && dy ? 1.414 : 1);
      const ci = GS.cityAt[n];
      if (ci >= 0 && n !== goal && MAP.cities[ci].owner !== owner) step += 25;
      const ng = g[c] + step;
      if (stamp[n] !== gen || ng < g[n]) { stamp[n] = gen; g[n] = ng; came[n] = c; heap.push(ng + hfun(n), n); }
    }
  }
  if (!found) return null;
  const path = [];
  for (let c = goal; c !== start && c >= 0; c = came[c]) path.push(c);
  path.reverse();
  return path;
}

/* ---------- orders ---------- */
export function canOrder(a) { return !a.dead && a.state !== 'battle' && a.state !== 'rout'; }
export function setPath(a, tx, ty) {
  a.path = findPath(a.x, a.y, tx, ty, a.owner);
  a.pi = 0; a.pathVersion++;
  a.state = a.path && a.path.length ? 'move' : 'idle';
  return !!a.path;
}
export function orderMove(a, x, y) { if (!canOrder(a)) return false; a.target = null; return setPath(a, x, y); }
export function orderTarget(a, kind, ref) {
  if (!canOrder(a)) return false;
  a.target = { kind, ref, hostile: (kind === 'city' || kind === 'fort') && ref.owner >= 0 && ref.owner !== a.owner };   // hostile: aimed at a power's place on purpose
  a.repathT = 1.5;
  const p = targetPos(a.target);
  return setPath(a, p.x, p.y);
}
export function targetPos(T) { return T.kind === 'city' || T.kind === 'fort' ? { x: T.ref.x, y: T.ref.y } : { x: T.ref.x, y: T.ref.y }; }
export function isHostileTarget(a, T) {
  if (!T) return false;
  if (T.kind === 'army') return T.ref.owner !== a.owner;
  if (T.kind === 'city' || T.kind === 'fort') return T.ref.owner !== a.owner;
  return false;
}

export function updateArmy(a, dt) {
  if (a.dead || a.state === 'battle') return;
  if (a.state === 'rout') { a.routT -= dt; if (a.routT <= 0) a.state = a.path && a.pi < a.path.length ? 'move' : 'idle'; }
  const T = a.target;
  if (T) {
    const invalid = (T.kind === 'army' || T.kind === 'merge') ? (T.ref.dead || (T.kind === 'army' && T.ref.owner === a.owner) || (T.kind === 'merge' && T.ref.owner !== a.owner))
      : T.kind === 'fort' ? (T.ref.dead || T.ref.owner === a.owner) : false;
    if (invalid) { a.target = null; if (a.state === 'move' && (T.kind === 'army' || T.kind === 'merge')) { a.path = null; a.state = 'idle'; } }
    else if ((T.kind === 'army' || T.kind === 'merge') && a.state !== 'rout') {
      a.repathT -= dt;
      if (a.repathT <= 0) {
        a.repathT = 1.5;
        if (T.kind === 'army' && !knowsArmy(a.owner, T.ref)) {
          // out of sight: march on to where it was last seen, and give up after a while
          a.lostT = (a.lostT || 0) + 1.5;
          if (a.lostT > 20) { a.target = null; a.lostT = 0; }
        } else { a.lostT = 0; setPath(a, T.ref.x, T.ref.y); }
      }
      if (T.kind === 'merge' && dist(a, T.ref) < 1.3 && T.ref.state !== 'battle') { mergeArmies(T.ref, a); return; }
    }
  }
  if (T && (T.kind === 'city' || T.kind === 'fort') && T.ref.owner !== a.owner && a.state === 'move' && dist(a, T.ref) < (T.kind === 'city' && T.ref.major ? 2.5 : 1.7)) { a.pi = a.path ? a.path.length : 0; arrive(a); return; }
  if (a.path && a.pi < a.path.length) {
    const c = a.path[a.pi], tx = c % MAP.W, ty = (c / MAP.W) | 0;
    const dx = tx - a.x, dy = ty - a.y, d = Math.hypot(dx, dy);
    if (d < 0.06) a.pi++;
    else {
      const step = Math.min(d, armySpeed(a) * dt);
      a.x += dx / d * step; a.y += dy / d * step;
      a.heading = dampAngle(a.heading, Math.atan2(dx, dy), 7, dt);
      if (a.state !== 'rout') a.state = 'move';
    }
    if (a.pi >= a.path.length) arrive(a);
  } else if (a.state === 'move') arrive(a);
}
export function arrive(a) {
  a.path = null;
  if (a.state !== 'rout') a.state = 'idle';
  const T = a.target;
  if (!T) return;
  // a neutral town taken by someone we are at peace with while we marched: stand down
  if ((T.kind === 'city' || T.kind === 'fort') && !T.hostile && T.ref.owner >= 0 && T.ref.owner !== a.owner && atPeace(a.owner, T.ref.owner)) { a.target = null; return; }
  if (T.kind === 'city') {
    if (T.ref.owner !== a.owner) { if (dist(a, T.ref) < 2.8) startSiege([a], T.ref, 'city'); }
    else a.target = null;
  } else if (T.kind === 'fort') {
    if (!T.ref.dead && T.ref.owner !== a.owner && dist(a, T.ref) < 2.8) startSiege([a], T.ref, 'fort');
  } else if (T.kind === 'merge') {
    if (!T.ref.dead && dist(a, T.ref) < 2) mergeArmies(T.ref, a);
    else a.target = null;
  }
}
