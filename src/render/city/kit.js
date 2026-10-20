import { THREE } from '../../three.js';
import { TAU } from '../../core/math.js';
import { rng32 } from '../../map/generate.js';
import { cone, cyl, sph } from '../geom.js';

/* =========================================================
   City generator kit: what every culture's rules share. Frames that place parts in a building's own space, roof and
   wall shapes, seeded randomness, street clipping, the grid planner (Roman, Punic and Egyptian towns), trees, and
   the ring a city wall follows.
   Coordinates: u (world x) and v (world z) from the city's centre, y up. In a building's frame, x runs across its
   front, z toward the street it faces; w is its width across the front, l its depth.
   ========================================================= */
export const GREEN = {
  cypress: '#2f5a2c', leaf: '#5d7f3a', leaf2: '#6f8f45', trunk: '#5b4330', lawn: '#7f9a58',
  palm: '#5c7a33', palm2: '#6d8b3b', palmTrunk: '#7c6444', oak: '#4c6b30', oak2: '#5a7936', crop: '#7e9748', soil: '#8a6f4d',
};

/* ---------- frames ---------- */
// turn a point of a building's own frame (x across, z toward its front) by rot about the vertical
export const rotY = (x, z, rot) => [x * Math.cos(rot) + z * Math.sin(rot), -x * Math.sin(rot) + z * Math.cos(rot)];
// the rotation that turns a building's front (+z) toward the direction (fu, fv)
export const facing = (fu, fv) => Math.atan2(fu, fv);
export const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
// a builder that places parts in a frame at (x, z) turned by rot; extra: { ry (turn), rz (tilt, applied first), scale }
export function frame(parts, x, z, rot) {
  return (geo, color, lx, ly, lz, extra = {}) => {
    const [a, b] = rotY(lx, lz, rot);
    let scale = extra.scale;
    if (geo.dims) {                                     // a box(): the shared unit box, scaled
      const d = geo.dims;
      scale = scale ? [d[0] * scale[0], d[1] * scale[1], d[2] * scale[2]] : d;
      geo = UNIT_BOX;
    }
    parts.push({ geo, color, pos: [x + a, ly, z + b], rot: [0, rot + (extra.ry || 0), extra.rz || 0], scale });
  };
}
// a frame inside another builder's frame (a temple inside a forum, a hut on a terrace); it keeps the far flag
export function sub(add, x, z, rot = 0, y = 0) {
  const f = (geo, color, lx, ly, lz, extra = {}) => {
    const [a, b] = rotY(lx, lz, rot);
    add(geo, color, x + a, ly + y, z + b, { ...extra, ry: rot + (extra.ry || 0) });
  };
  f.far = add.far;
  return f;
}

/* ---------- shapes (unit size, centred, flat shaded) ---------- */
// a box without its bottom face, which nobody sees in a town; box() only notes its size, and the frame draws the
// shared unit box scaled to it
export const UNIT_BOX = (() => {
  const g = new THREE.BoxGeometry(1, 1, 1), idx = g.index.array;
  g.setIndex([...idx.slice(0, 18), ...idx.slice(24)]);
  return g;
})();
export const box = (x, y, z) => ({ dims: [x, y, z] });
// a single face toward +z: doors and windows painted on a wall
export const PANE = new THREE.PlaneGeometry(1, 1);
export function flat(g) { const n = g.index ? g.toNonIndexed() : g; n.computeVertexNormals(); return n; }
// a solid from its 8 corners, in box order: index = (x ? 1 : 0) + (y ? 2 : 0) + (z ? 4 : 0)
export function prism(c) {
  const quads = [[0, 4, 6, 2], [1, 3, 7, 5], [0, 1, 5, 4], [2, 6, 7, 3], [0, 2, 3, 1], [4, 5, 7, 6]];
  const p = [];
  for (const [a, b, d, e] of quads) p.push(...c[a], ...c[b], ...c[d], ...c[a], ...c[d], ...c[e]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.computeVertexNormals();
  return g;
}
// a block whose top is kx by kz of its base: battered walls, pylons, obelisks; above 1, a flared cornice
export function taper(kx, kz) {
  const c = [];
  for (let i = 0; i < 8; i++) {
    const x = i & 1 ? 0.5 : -0.5, y = i & 2 ? 0.5 : -0.5, z = i & 4 ? 0.5 : -0.5;
    c.push([y > 0 ? x * kx : x, y, y > 0 ? z * kz : z]);
  }
  return prism(c);
}
export const HIP = flat(cone(0.7071, 1, 4).rotateY(Math.PI / 4));
export const GABLE_ROOF = (() => {
  const p = [[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0, 0.5, -0.5], [-0.5, -0.5, 0.5], [0, 0.5, 0.5], [0.5, -0.5, 0.5]];
  const tri = (a, b, c) => [...p[a], ...p[b], ...p[c]];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([...tri(0, 2, 1), ...tri(3, 5, 4), ...tri(0, 3, 4), ...tri(0, 4, 2), ...tri(1, 2, 4), ...tri(1, 4, 5)], 3));
  g.computeVertexNormals();
  return g;
})();
export const BATTER = taper(1, 0.6);                  // a wall leaning back on both faces
export const OBELISK = taper(0.62, 0.62);
export const CAVETTO = taper(1.18, 1.3);              // the flared cornice of Egyptian and Punic buildings
// a thin slab sloping down toward its front (+z): awnings, lean-to roofs; scaled by (w, drop, depth)
export const SLAB = prism([[-0.5, 0.75, -0.5], [0.5, 0.75, -0.5], [-0.5, 1, -0.5], [0.5, 1, -0.5], [-0.5, -0.25, 0.5], [0.5, -0.25, 0.5], [-0.5, 0, 0.5], [0.5, 0, 0.5]]);

/* ---------- randomness ---------- */
export const pick = (rnd, list) => list[(rnd() * list.length) | 0];
export function hash3(a, b, c) {
  let h = (a | 0) ^ Math.imul(b | 0, 0x9e3779b1) ^ Math.imul(c | 0, 0x85ebca77);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return (h ^ (h >>> 15)) >>> 0;
}
// a generator of its own for one part of a city (a block, the paths, the trees), so the rest stays put when it changes
export const subRng = (seed, a, b = 0) => rng32(hash3(seed, a, b));
export const distSeg = (p, a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
};
export const nearestOnSeg = (p, a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
  return [a[0] + t * dx, a[1] + t * dy];
};

/* ---------- rivers through the town (spec.water: [{ a, b, w (half width) }]) ---------- */
export const nearWater = (water, p, pad) => water.some((S) => distSeg(p, S.a, S.b) < S.w + pad);
// where two segments cross: the fraction along the first, or null
export function crossAt(a, b, c, d) {
  const r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]], den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den, u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
}
// bridges where the main streets and the roads in from the gates cross the river (and one more in a city), if
// they cross it squarely enough; the streets stop at the water everywhere else
export function addBridges(plan) {
  const water = plan.spec.water || [], bridges = [], cands = [];
  if (!water.length) return;
  for (const S of plan.streets) for (const W of water) {
    const t = crossAt(S.a, S.b, W.a, W.b);
    if (t === null) continue;
    const sd = [S.b[0] - S.a[0], S.b[1] - S.a[1]], wd = [W.b[0] - W.a[0], W.b[1] - W.a[1]];
    const sin = Math.abs(sd[0] * wd[1] - sd[1] * wd[0]) / (Math.hypot(...sd) * Math.hypot(...wd) || 1);
    if (sin < 0.7) continue;
    const p = [S.a[0] + sd[0] * t, S.a[1] + sd[1] * t];
    cands.push({ S, p, sd, l: (W.w * 2 + 0.12) / sin, key: (S.main || S.diag || S.gate ? 0 : 10) + Math.hypot(p[0], p[1]) });
  }
  let spare = plan.spec.major ? 1 : 0;
  for (const C of cands.sort((a, b) => a.key - b.key)) {
    if (bridges.some((B) => Math.hypot(B.p[0] - C.p[0], B.p[1] - C.p[1]) < 0.25)) continue;
    if (C.key >= 10 && spare-- <= 0) continue;
    bridges.push(C);
    plan.items.push({ kind: 'bridge', x: C.p[0], z: C.p[1], rot: facing(C.sd[0], C.sd[1]), w: C.S.w + 0.03, l: C.l, seed: 1 });
  }
  const out = [];
  for (const S of plan.streets) {
    const len = Math.hypot(S.b[0] - S.a[0], S.b[1] - S.a[1]), n = Math.max(2, Math.ceil(len / 0.02));
    const at = (k) => [S.a[0] + (S.b[0] - S.a[0]) * k / n, S.a[1] + (S.b[1] - S.a[1]) * k / n];
    const dry = (k) => {
      const p = at(k);
      return !nearWater(water, p, 0.01) || bridges.some((B) => B.S === S && Math.hypot(p[0] - B.p[0], p[1] - B.p[1]) < B.l / 2 + 0.02);
    };
    let k0 = null;
    for (let k = 0; k <= n + 1; k++) {
      const ok = k <= n && dry(k);
      if (ok && k0 === null) k0 = k;
      if (!ok && k0 !== null) { if ((k - 1 - k0) * len / n > 0.04) out.push({ ...S, a: at(k0), b: at(k - 1) }); k0 = null; }
    }
  }
  plan.streets = out;
}
export function bridge(add, it, rnd, pal) {
  const w = it.w, l = it.l, y = 0.075, c = pal.bridge || '#d8cfbb', c2 = pal.bridge2 || '#c4b99f';
  add(box(w, 0.022, l), c, 0, y - 0.011, 0);
  for (const sx of [-1, 1]) add(box(0.012, 0.028, l), c2, sx * (w / 2 - 0.006), y + 0.014, 0);
  const n = Math.max(1, Math.round(l / 0.22));
  for (let k = 1; k < n; k++) add(box(w * 0.9, y, 0.035), c2, 0, y / 2, -l / 2 + k * l / n);
}

/* ---------- streets cut by landmarks ---------- */
// the stretch of segment A-B (fractions of its length) inside a circle, or inside a rectangle of grid coordinates
export const circleCut = (u, v, r) => (A, B) => {
  const dx = B[0] - A[0], dy = B[1] - A[1], fx = A[0] - u, fy = A[1] - v;
  const a = dx * dx + dy * dy, b = 2 * (fx * dx + fy * dy), c = fx * fx + fy * fy - r * r, D = b * b - 4 * a * c;
  if (D <= 0 || a === 0) return null;
  const t0 = (-b - Math.sqrt(D)) / (2 * a), t1 = (-b + Math.sqrt(D)) / (2 * a);
  return t1 > 0 && t0 < 1 ? [Math.max(0, t0), Math.min(1, t1)] : null;
};
export const rectCut = (toGrid, s0, s1, t0, t1) => (A, B) => {
  const a = toGrid(A[0], A[1]), b = toGrid(B[0], B[1]);
  const p = [a[0] - b[0], b[0] - a[0], a[1] - b[1], b[1] - a[1]], q = [a[0] - s0, s1 - a[0], a[1] - t0, t1 - a[1]];
  let u1 = 0, u2 = 1;
  for (let k = 0; k < 4; k++) {
    if (p[k] === 0) { if (q[k] < 0) return null; continue; }
    const r = q[k] / p[k];
    if (p[k] < 0) u1 = Math.max(u1, r); else u2 = Math.min(u2, r);
  }
  return u1 < u2 ? [u1, u2] : null;
};
export function clipStreets(streets, cuts) {
  if (!cuts.length) return streets;
  const out = [];
  for (const S of streets) {
    const dx = S.b[0] - S.a[0], dy = S.b[1] - S.a[1], len = Math.hypot(dx, dy);
    const iv = cuts.map((f) => f(S.a, S.b)).filter(Boolean).sort((p, q) => p[0] - q[0]);
    let t = 0;
    for (const [c0, c1] of [...iv, [1, 1]]) {
      if ((c0 - t) * len > 0.02) out.push({ ...S, a: [S.a[0] + dx * t, S.a[1] + dy * t], b: [S.a[0] + dx * c0, S.a[1] + dy * c0] });
      t = Math.max(t, c1);
    }
  }
  return out;
}

/* ---------- the grid planner ---------- */
// the lots of a block cut n by m (n along s, m along t)
export function cutGrid(B, n, m, kind) {
  const out = [], hs = B.hs / n, ht = B.ht / m;
  for (let a = 0; a < n; a++) for (let b = 0; b < m; b++) out.push({ s: B.s0 + (2 * a + 1) * hs, t: B.t0 + (2 * b + 1) * ht, hs: hs - 0.008, ht: ht - 0.008, kind });
  return out;
}
export const wholeBlock = (B, kind) => [{ s: B.s, t: B.t, hs: B.hs - 0.008, ht: B.ht - 0.008, kind }];

/**
 * A city on a grid laid along the main gate's road. s runs along that road (toward the gate), t across it.
 * cfg: { P: [pitch along s, along t] of a city, Ptown, sw (street), mw (main street), townGrid (a town gets side streets),
 *        landmarks(ctx), cut(rnd, block, ctx) -> lots, kind(rnd, lot, ctx), trees(ctx, rnd) }
 * Each block draws from its own seed and landmarks only take ground from the houses, so a city keeps its houses
 * when it builds something new.
 */
export function gridCity(plan, cfg) {
  const { spec } = plan, { R, major } = spec;
  const phi = spec.gates[0];
  const e1 = [Math.cos(phi), Math.sin(phi)], e2 = [-Math.sin(phi), Math.cos(phi)];
  const G = (s, t) => [s * e1[0] + t * e2[0], s * e1[1] + t * e2[1]];
  const toGrid = (u, v) => [u * e1[0] + v * e1[1], u * e2[0] + v * e2[1]];
  const Rin = R - (cfg.margin || 0.1);
  const [Ps, Pt] = major ? cfg.P : cfg.Ptown;
  const grid = major || !!cfg.townGrid;
  const lineW = (k) => (k === 0 ? cfg.mw : grid ? cfg.sw : 0.03);
  const ks = Math.floor(Rin / Ps), kt = Math.floor(Rin / Pt);
  const street = (a, b, w, main, diag) => plan.streets.push({ a, b, w, main, diag });
  const along = (t, w, main) => { const h = Math.sqrt(Math.max(0, Rin * Rin - t * t)); if (h > 0.1) street(G(-h, t), G(h, t), w, main); };
  const across = (s, w, main) => { const h = Math.sqrt(Math.max(0, Rin * Rin - s * s)); if (h > 0.1) street(G(s, -h), G(s, h), w, main); };
  along(0, cfg.mw, true); across(0, cfg.mw, true);
  if (grid) {
    for (let k = 1; k <= kt; k++) for (const sg of [-1, 1]) along(sg * k * Pt, cfg.sw, false);
    for (let k = 1; k <= ks; k++) for (const sg of [-1, 1]) across(sg * k * Ps, cfg.sw, false);
  }
  for (const a of spec.gates.slice(1)) street([Math.cos(a) * Rin, Math.sin(a) * Rin], [0, 0], cfg.sw, false, true);

  // block (i, j): between grid lines i and i + 1 along s, j and j + 1 along t
  const block = (i, j) => {
    const s0 = i * Ps + lineW(i) / 2 + 0.012, s1 = (i + 1) * Ps - lineW(i + 1) / 2 - 0.012;
    const t0 = j * Pt + lineW(j) / 2 + 0.012, t1 = (j + 1) * Pt - lineW(j + 1) / 2 - 0.012;
    return { i, j, s0, s1, t0, t1, s: (s0 + s1) / 2, t: (t0 + t1) / 2, hs: (s1 - s0) / 2, ht: (t1 - t0) / 2 };
  };
  // grid coordinates are a turn of the city's, so distances from the centre are the same
  const inside = (s0, s1, t0, t1) => [[s0, t0], [s1, t0], [s0, t1], [s1, t1]].every(([s, t]) => Math.hypot(s, t) <= Rin);
  const DIR = { 's+': [1, 0], 's-': [-1, 0], 't+': [0, 1], 't-': [0, -1] };
  const water = spec.water || [];
  const wet = (s0, s1, t0, t1, pad = 0.01) => water.some((S) => rectCut(toGrid, s0 - S.w - pad, s1 + S.w + pad, t0 - S.w - pad, t1 + S.w + pad)(S.a, S.b));
  const ctx = { plan, spec, cfg, e1, e2, G, toGrid, Rin, Ps, Pt, ks, kt, block, inside, wet, zones: [], lots: [] };
  ctx.rot = (front) => { const f = G(...DIR[front]); return facing(f[0], f[1]); };
  ctx.has = (id) => spec.imps.includes(id);
  // a landmark on a rectangle of the grid, its front toward `front` ('s+', 's-', 't+', 't-'); it takes the houses' ground,
  // and with clip the streets stop at it
  ctx.rectItem = (kind, s0, s1, t0, t1, front, extra = {}, clip = false) => {
    const c = G((s0 + s1) / 2, (t0 + t1) / 2), alongS = front[0] === 's';
    const it = { kind, x: c[0], z: c[1], rot: ctx.rot(front), w: alongS ? t1 - t0 : s1 - s0, l: alongS ? s1 - s0 : t1 - t0, seed: hash3(spec.seed, kind.length * 31 + 5, 9), ...extra };
    plan.items.push(it);
    ctx.zones.push({ rect: [s0, s1, t0, t1], cut: clip ? rectCut(toGrid, s0, s1, t0, t1) : null });
    return it;
  };
  // a landmark on blocks i0, j0 to i1, j1; if the river runs there, on the nearest free blocks beside them
  ctx.blocksItem = (kind, i0, j0, i1, j1, front, extra, clip) => {
    const a = block(i0, j0), b = block(i1, j1);
    if (wet(a.s0, b.s1, a.t0, b.t1)) {
      for (const [di, dj] of [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const a2 = block(i0 + di, j0 + dj), b2 = block(i1 + di, j1 + dj);
        if (inside(a2.s0, b2.s1, a2.t0, b2.t1) && ctx.clear(a2.s0, b2.s1, a2.t0, b2.t1)) return ctx.rectItem(kind, a2.s0, b2.s1, a2.t0, b2.t1, front, extra, clip);
      }
      const it = ctx.anywhere(kind, [(a.s0 + b.s1) / 2, (a.t0 + b.t1) / 2], i1 - i0 + 1, j1 - j0 + 1, extra, clip);
      if (it) return it;
    }
    return ctx.rectItem(kind, a.s0, b.s1, a.t0, b.t1, front, extra, clip);
  };
  // the last resort for a landmark: the nearest free, dry n by m blocks inside the walls (else a single block), its
  // front toward the nearer main street
  ctx.anywhere = (kind, near, n, m, extra, clip) => {
    let best = null;
    for (const [a, b] of n * m > 1 ? [[n, m], [1, 1]] : [[1, 1]]) {
      for (let i = -ks - 1; i <= ks; i++) for (let j = -kt - 1; j <= kt; j++) {
        const A = block(i, j), Z = block(i + a - 1, j + b - 1);
        if (!inside(A.s0, Z.s1, A.t0, Z.t1) || !ctx.clear(A.s0, Z.s1, A.t0, Z.t1)) continue;
        const d = Math.hypot((A.s0 + Z.s1) / 2 - near[0], (A.t0 + Z.t1) / 2 - near[1]);
        if (!best || d < best.d) best = { A, Z, d };
      }
      if (best) break;
    }
    if (!best) return null;
    const { A, Z } = best, s = (A.s0 + Z.s1) / 2, t = (A.t0 + Z.t1) / 2;
    const front = Math.abs(s) <= Math.abs(t) ? (s > 0 ? 's-' : 's+') : (t > 0 ? 't-' : 't+');
    return ctx.rectItem(kind, A.s0, Z.s1, A.t0, Z.t1, front, extra, clip);
  };
  ctx.circleItem = (kind, u, v, r, rot, extra = {}, clip = true) => {
    const it = { kind, x: u, z: v, rot, w: r * 2, l: r * 2, seed: hash3(spec.seed, kind.length * 37 + 3, 11), ...extra };
    plan.items.push(it);
    ctx.zones.push({ circle: [u, v, r], cut: clip ? circleCut(u, v, r) : null });
    return it;
  };
  // the outermost block of row j that fits inside the walls, toward the main gate (dir 1) or away from it
  ctx.outer = (j, dir = 1) => {
    let best = null;
    for (let k = 0; k <= ks + 1; k++) { const i = dir > 0 ? k : -k - 1, b = block(i, j); if (inside(b.s0, b.s1, b.t0, b.t1)) best = i; }
    return best;
  };
  ctx.local = (it, lx, lz) => { const [a, b] = rotY(lx, lz, it.rot); return [it.x + a, it.z + b]; };
  ctx.flag = (uv, y) => { plan.flagAt = [uv[0], y, uv[1]]; };
  // is this rectangle of the grid free of the landmarks placed so far?
  ctx.clear = (s0, s1, t0, t1) => !wet(s0, s1, t0, t1) && ctx.zones.every((z) => (z.rect
    ? s1 < z.rect[0] || s0 > z.rect[1] || t1 < z.rect[2] || t0 > z.rect[3]
    : (() => { const [cs, ct] = toGrid(z.circle[0], z.circle[1]); return Math.hypot(Math.max(s0 - cs, 0, cs - s1), Math.max(t0 - ct, 0, ct - t1)) > z.circle[2]; })()));
  ctx.clearCircle = (u, v, r) => {
    const [cs, ct] = toGrid(u, v);
    return !nearWater(water, [u, v], r) && ctx.zones.every((z) => (z.rect
      ? Math.hypot(Math.max(z.rect[0] - cs, 0, cs - z.rect[1]), Math.max(z.rect[2] - ct, 0, ct - z.rect[3])) > r
      : Math.hypot(u - z.circle[0], v - z.circle[1]) > r + z.circle[2]));
  };
  // the first of several places (blocks i0, j0 to i1, j1, front) that fits inside the walls and is free
  ctx.firstFit = (kind, cands, extra, clip) => {
    let first = null;
    for (const c of cands) {
      if (!c) continue;
      const [i0, j0, i1, j1, front] = c;
      if (i0 === null || i1 === null) continue;
      const a = block(i0, j0), b = block(i1, j1);
      first = first || { near: [(a.s0 + b.s1) / 2, (a.t0 + b.t1) / 2], n: i1 - i0 + 1, m: j1 - j0 + 1 };
      if (inside(a.s0, b.s1, a.t0, b.t1) && ctx.clear(a.s0, b.s1, a.t0, b.t1)) return ctx.rectItem(kind, a.s0, b.s1, a.t0, b.t1, front, extra, clip);
    }
    return ctx.anywhere(kind, first ? first.near : [0, 0], first ? first.n : 1, first ? first.m : 1, extra, clip);
  };

  cfg.landmarks(ctx);
  plan.streets = clipStreets(plan.streets, ctx.zones.filter((z) => z.cut).map((z) => z.cut));
  const diag = plan.streets.filter((S) => S.diag);
  const taken = (L) => ctx.zones.some((z) => (z.rect
    ? L.s + L.hs > z.rect[0] - 0.01 && L.s - L.hs < z.rect[1] + 0.01 && L.t + L.ht > z.rect[2] - 0.01 && L.t - L.ht < z.rect[3] + 0.01
    : Math.hypot(L.u - z.circle[0], L.v - z.circle[1]) < z.circle[2] + Math.max(L.hs, L.ht) * 0.6))
    || diag.some((S) => rectCut(toGrid, L.s - L.hs - S.w / 2, L.s + L.hs + S.w / 2, L.t - L.ht - S.w / 2, L.t + L.ht + S.w / 2)(S.a, S.b))
    || wet(L.s - L.hs, L.s + L.hs, L.t - L.ht, L.t + L.ht);

  for (let i = -ks - 1; i <= ks; i++) for (let j = -kt - 1; j <= kt; j++) {
    const B = block(i, j);
    if (B.hs < 0.03 || B.ht < 0.03 || Math.hypot(B.s, B.t) > Rin + Math.max(Ps, Pt) * 0.5) continue;
    const rnd = subRng(spec.seed, i * 977 + 13, j * 631 + 7);
    B.d = Math.hypot(B.s, B.t) / R;
    const place = (L, depth) => {
      if (!inside(L.s - L.hs, L.s + L.hs, L.t - L.ht, L.t + L.ht)) {
        // at the edge of the town: cut the lot in two and try the halves
        if (depth >= 2 || Math.max(L.hs, L.ht) < 0.06) return;
        const kind = L.whole ? L.kind : undefined;
        if (L.hs >= L.ht) for (const sg of [-1, 1]) place({ s: L.s + sg * L.hs / 2, t: L.t, hs: L.hs / 2 - 0.004, ht: L.ht, kind }, depth + 1);
        else for (const sg of [-1, 1]) place({ s: L.s, t: L.t + sg * L.ht / 2, hs: L.hs, ht: L.ht / 2 - 0.004, kind }, depth + 1);
        return;
      }
      const c = G(L.s, L.t);
      L.u = c[0]; L.v = c[1]; L.block = B;
      // its front: toward the edge of the block it sits on, or the nearer main street for a whole block
      const os = L.s - B.s, ot = L.t - B.t;
      let fs = 0, ft = 0;
      if (Math.abs(os) > 1e-4 && Math.abs(os) / B.hs >= Math.abs(ot) / B.ht) fs = Math.sign(os);
      else if (Math.abs(ot) > 1e-4) ft = Math.sign(ot);
      else if (Math.abs(B.s) <= Math.abs(B.t)) fs = -Math.sign(B.s) || 1; else ft = -Math.sign(B.t) || 1;
      L.front = [fs, ft];
      const f = G(fs, ft);
      const kind = L.kind || cfg.kind(rnd, L, ctx), seed = (rnd() * 1e9) | 0;
      if (taken(L)) return;
      ctx.lots.push(L);
      plan.items.push({ kind, x: c[0], z: c[1], rot: facing(f[0], f[1]), w: (fs ? L.ht : L.hs) * 2, l: (fs ? L.hs : L.ht) * 2, seed });
    };
    for (const L of cfg.cut(rnd, B, ctx)) place(L, 0);
  }
  if (cfg.trees) cfg.trees(ctx, subRng(spec.seed, 5, 5));
  addBridges(plan);
  return ctx;
}

// trees in the gaps along the walls
export function ringTrees(ctx, rnd, n, kinds) {
  const { plan, Rin, toGrid } = ctx;
  for (let k = 0; k < n; k++) {
    const a = rnd() * TAU, rr = Rin - 0.04 - rnd() * 0.08, kind = pick(rnd, kinds), seed = (rnd() * 1e9) | 0;
    const p = [Math.cos(a) * rr, Math.sin(a) * rr];
    if (plan.streets.some((S) => distSeg(p, S.a, S.b) < S.w / 2 + 0.06) || nearWater(plan.spec.water || [], p, 0.06)) continue;
    if (ctx.zones.some((z) => (z.circle ? Math.hypot(p[0] - z.circle[0], p[1] - z.circle[1]) < z.circle[2] + 0.05 : false))) continue;
    const [s, t] = toGrid(p[0], p[1]);
    if (ctx.zones.some((z) => z.rect && s > z.rect[0] - 0.05 && s < z.rect[1] + 0.05 && t > z.rect[2] - 0.05 && t < z.rect[3] + 0.05)) continue;
    if (ctx.lots.some((L) => Math.abs(s - L.s) < L.hs + 0.03 && Math.abs(t - L.t) < L.ht + 0.03)) continue;
    plan.items.push({ kind, x: p[0], z: p[1], rot: rnd() * TAU, seed });
  }
}

/* ---------- trees ---------- */
// a palm frond: a flat blade from the crown outward along +x, facing up
export const FROND = (() => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.5, 0.02, 0.5, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0.5, 0.02, -0.5], 3));
  g.computeVertexNormals();
  return g;
})();
export function tree(add, x, z, rnd, kind = 'tree') {
  if (add.far && kind !== 'palm') { farTree(sub(add, x, z), kind, rnd); return; }
  if (kind === 'cypress') { const h = 0.2 + rnd() * 0.1; add(cone(0.04, h, 6), GREEN.cypress, x, h / 2, z); return; }
  if (kind === 'palm') {
    const h = 0.14 + rnd() * 0.08, lean = (rnd() - 0.5) * 0.3, yaw = rnd() * TAU;
    const [dx, dz] = rotY(-Math.sin(lean) * h, 0, yaw), ty = Math.cos(lean) * h;
    add(cyl(0.007, 0.011, h, add.far ? 4 : 5, add.far), GREEN.palmTrunk, x + dx / 2, ty / 2, z + dz / 2, { ry: yaw, rz: lean });
    const n = 6;
    for (let k = 0; k < n; k++) add(FROND, k % 2 ? GREEN.palm : GREEN.palm2, x + dx, ty, z + dz, { ry: yaw + k / n * TAU + rnd() * 0.3, rz: -0.35 - rnd() * 0.3, scale: [0.07 + rnd() * 0.015, 1, 0.024] });
    return;
  }
  if (kind === 'oak') {
    const s = 0.9 + rnd() * 0.35;
    add(cyl(0.012 * s, 0.017 * s, 0.09 * s, 5), GREEN.trunk, x, 0.045 * s, z);
    add(sph(0.075 * s, 7, 5), GREEN.oak, x, 0.13 * s, z, { scale: [1, 0.8, 1] });
    add(sph(0.055 * s, 6, 4), GREEN.oak2, x + 0.04 * s, 0.17 * s, z - 0.02 * s, { scale: [1, 0.8, 1] });
    return;
  }
  add(cyl(0.01, 0.014, 0.08, 5), GREEN.trunk, x, 0.04, z);
  add(sph(0.07 + rnd() * 0.03, 7, 5), rnd() < 0.5 ? GREEN.leaf : GREEN.leaf2, x, 0.13, z, { scale: [1, 0.85, 1] });
}
export const TREE_KINDS = ['tree', 'cypress', 'palm', 'oak'];
// a tree for the far version of a city: one crown, few faces
export function farTree(add, kind, rnd) {
  if (kind === 'cypress') { add(cone(0.04, 0.24, 5), GREEN.cypress, 0, 0.12, 0); return; }
  add(cyl(0.01, 0.014, 0.08, 4, true), GREEN.trunk, 0, 0.04, 0);
  add(sph(0.075, 6, 4), kind === 'oak' ? GREEN.oak : GREEN.leaf, 0, 0.13, 0, { scale: [1, 0.85, 1] });
}

/* ---------- landmark models (render/landmarkModels.js fills MODEL_GEOS once they are loaded) ---------- */
export const MODEL_GEOS = {};
// place a loaded model at (x, y, z), scaled so its width (along x) is `width`, turned by ry; false if it is not loaded
export function model(add, key, x, y, z, width, ry = 0) {
  const M = MODEL_GEOS[key];
  if (!M) return false;
  const s = width / M.w;
  add(M.geo, null, x, y, z, { ry, scale: [s, s, s] });
  return true;
}

/* ---------- small shared pieces ---------- */
// a flat roof seen from above: a cornice round the edge and the terrace set inside it
export function flatRoof(add, w, l, h, cornice, terrace, x = 0, z = 0) {
  if (add.far) { add(box(w + 0.012, 0.012, l + 0.012), terrace, x, h + 0.004, z); return; }
  add(box(w + 0.012, 0.018, l + 0.012), cornice, x, h + 0.005, z);
  add(box(w - 0.024, 0.004, l - 0.024), terrace, x, h + 0.0145, z);
}
// a market stall: a counter under a sloping awning
export function stall(add, x, z, ry, cloth, wood) {
  const s = sub(add, x, z, ry);
  s(box(0.07, 0.03, 0.035), wood, 0, 0.015, 0);
  s(SLAB, cloth, 0, 0.065, 0.004, { scale: [0.085, 0.024, 0.06] });
  for (const sx of [-1, 1]) s(cyl(0.003, 0.003, 0.07, 4), wood, sx * 0.038, 0.035, 0.03);
}
export function amphorae(add, x, z, n, color) {
  for (let k = 0; k < n; k++) add(cyl(0.006, 0.004, 0.022, 5), color, x + (k % 3) * 0.013, 0.011, z + Math.floor(k / 3) * 0.013);
}

/* ---------- city walls ---------- */
// the ring a wall follows: segments between the gates (each with its centre, turn and length), and places for towers
export function wallRing(R, gates, n, half) {
  const gap = half / R;
  const inGate = (a) => gates.some((g) => Math.abs(angDiff(a, g)) < gap);
  const L = 2 * R * Math.sin(Math.PI / n) + 0.012;
  const segs = [];
  for (let k = 0; k < n; k++) {
    const a = (k + 0.5) / n * TAU;
    if (!inGate(a)) segs.push({ a, x: Math.cos(a) * R, z: Math.sin(a) * R, ry: -(a + Math.PI / 2), L });
  }
  const towers = (m) => {
    const out = [];
    for (let k = 0; k < m; k++) { let a = (k + 0.5) / m * TAU + gates[0]; if (inGate(a)) a += gap * 2.2; out.push(a); }
    return out;
  };
  // the arcs of wall between the gates, as [from, to] angles
  const arcs = () => {
    const g = [...gates].map((a) => ((a % TAU) + TAU) % TAU).sort((p, q) => p - q);
    return g.map((a, k) => [a + gap, (k + 1 < g.length ? g[k + 1] : g[0] + TAU) - gap]).filter(([a, b]) => b > a + 0.05);
  };
  return { R, gates, gap, inGate, segs, towers, arcs };
}
// a band of wall along an arc of the ring, from a cross-section profile [[radius, y], ...] listed from the outside in
// (LatheGeometry; the other way round it faces inward and vanishes)
export function ringBand(profile, a0, a1) {
  const n = Math.max(2, Math.round((a1 - a0) / TAU * 56));
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), n, Math.PI / 2 - a1, a1 - a0);
}
