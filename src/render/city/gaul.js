import { TAU } from '../../core/math.js';
import { cone, cyl, sph } from '../geom.js';
import { GABLE_ROOF, GREEN, HIP, PANE, addBridges, amphorae, box, distSeg, facing, frame, model, nearWater, nearestOnSeg, pick, ringBand, stall, sub, subRng, tree, wallRing } from './kit.js';

/* =========================================================
   Gaulish towns, after the oppida (Bibracte, Alesia): no grid, but paths wandering in from the gates to an open
   place, round houses and long houses thatched to the ground, raised granaries, pens and garden plots, oaks. The
   chief's hall stands on the place (in the capital on a mound). A sanctuary in its square ditch for the temple, a
   market of stalls and wine jars for the forum, the warriors' hall and its yard for the barracks, a farmyard for the
   farmlands. Walls: a palisade, then an earth rampart, then the murus gallicus faced in stone.
   ========================================================= */
export const GAUL_PAL = {
  walls: ['#d4c09a', '#cbb48a', '#c2a77c', '#d9c8a4', '#bfa47e'], thatch: ['#a88d55', '#b49a5e', '#9c8350', '#8f7a4c', '#b8a06a'],
  timber: '#6b4f33', timber2: '#57402b', door: '#3e2f22', street: '#a4916b', main: '#ad9a74', place: '#b3a07a', fence: '#7a5c3c',
  stone: '#a59a86', bridge: '#7a5a3a', bridge2: '#5e4630', plaid: ['#7b3b2e', '#2f5a4a', '#c19a3a', '#3d4f7a'], wool: '#eee6d6', pig: '#8a6650', hay: '#c9ae5a', pot: '#b0683f',
  earth: '#8b7853', ditch: '#6b5a40',
};

export function gaulPlan(plan) {
  const { spec } = plan, { R, major, seed, gates } = spec, water = spec.water || [];
  const Rin = R - 0.13, phi = gates[0];
  const polar = (a, r) => [Math.cos(a) * r, Math.sin(a) * r];
  const placeR = major ? 0.26 : 0.16;
  // the paths: in from each gate to the place, wandering a little
  const rP = subRng(seed, 3, 1);
  gates.forEach((g, k) => {
    const a = polar(g, R + 0.02), b = polar(g, placeR * 0.8), n = 4, pts = [a];
    for (let i = 1; i < n; i++) {
      const f = i / n, off = (rP() - 0.5) * 0.2 * Math.sin(f * Math.PI);
      pts.push([a[0] + (b[0] - a[0]) * f - Math.sin(g) * off, a[1] + (b[1] - a[1]) * f + Math.cos(g) * off]);
    }
    pts.push(b);
    for (let i = 0; i < n; i++) plan.streets.push({ a: pts[i], b: pts[i + 1], w: k === 0 ? 0.075 : 0.06, main: k === 0, gate: true });
  });
  // a lane round the town
  if (major) {
    const n = 14, rr = R * 0.68, pts = [];
    for (let i = 0; i < n; i++) { const a = i / n * TAU, q = rr + (rP() - 0.5) * 0.08; pts.push(polar(a, q)); }
    for (let i = 0; i < n; i++) plan.streets.push({ a: pts[i], b: pts[(i + 1) % n], w: 0.045, main: false });
  }
  addBridges(plan);
  plan.items.push({ kind: 'place', x: 0, z: 0, rot: phi, w: placeR * 2, l: placeR * 2, seed: subRng(seed, 8, 1)() * 1e9 | 0 });
  // the chief's hall across the place from the main gate, its door on the place
  const ha = phi + Math.PI, hr = placeR + (spec.capital ? 0.2 : major ? 0.15 : 0.1);
  const [hx, hz] = polar(ha, hr);
  const hall = { kind: spec.capital ? 'greatHall' : 'hall', x: hx, z: hz, rot: facing(-hx, -hz), w: major ? 0.2 : 0.15, l: major ? 0.32 : 0.22, seed: (seed * 7 + 3) | 0 };
  plan.items.push(hall);
  const fixed = [{ u: 0, v: 0, r: placeR }, { u: hx, v: hz, r: spec.capital ? 0.27 : hall.l * 0.6 }];
  const [fx, fz] = polar(ha, placeR - 0.04);
  plan.flagAt = [fx, 0.42, fz];
  // the improvements' landmarks, each on its own ground at a place set by the main gate, moved off the paths
  const marks = [];
  const slot = (kind, a, f, r) => {
    for (const [da, kf] of [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05, 1.4, -1.4, 1.75, -1.75, 2.1, -2.1, 2.45, -2.45, Math.PI].flatMap((x) => [[x, 1], [x, 0.8], [x, 1.25]])) {
      const [u, v] = polar(phi + a + da, f * kf * R);
      if (Math.hypot(u, v) + r > Rin + 0.02) continue;
      if (plan.streets.some((S) => distSeg([u, v], S.a, S.b) < r + S.w / 2) || nearWater(water, [u, v], r)) continue;
      if ([...fixed, ...marks].some((z) => Math.hypot(u - z.u, v - z.v) < r + z.r)) continue;
      marks.push({ kind, u, v, r });
      return;
    }
  };
  const has = (id) => spec.imps.includes(id);
  // (in a city, between the place and the lane round the town)
  const f = major ? 0.37 : 0.5;
  if (has('temple')) slot('sanctuary', Math.PI * 0.62, f, major ? 0.24 : 0.18);
  if (has('forum')) slot('market', -0.75, f, major ? 0.2 : 0.16);
  if (has('barracks')) slot('warhall', 0.62, f, major ? 0.21 : 0.16);
  if (has('farm')) slot('farmyard', -Math.PI * 0.62, f, major ? 0.22 : 0.17);
  for (const m of marks) plan.items.push({ kind: m.kind, x: m.u, z: m.v, rot: facing(-m.u, -m.v), w: m.r * 2, l: m.r * 2, seed: (seed * 13 + m.kind.length) | 0 });

  // the houses: darts thrown over the town, kept off the paths, the place and each other; the landmarks only take
  // ground from them afterwards, so the town keeps its houses when it builds
  const rH = subRng(seed, 4, 2), N = major ? 460 : 190, houses = [];
  const KINDS = [['round', 0.52], ['long', 0.17], ['granary', 0.12], ['pen', 0.08], ['plot', 0.11]];
  for (let k = 0; k < N; k++) {
    const a = rH() * TAU, rr = Math.sqrt(rH()) * Rin, x = rH(), size = rH(), jit = (rH() - 0.5) * 0.5, hseed = (rH() * 1e9) | 0;
    let kind = KINDS[KINDS.length - 1][0], acc = 0;
    for (const [kk, wgt] of KINDS) { acc += wgt; if (x < acc) { kind = kk; break; } }
    let w, l;
    if (kind === 'round') w = l = 0.1 + size * 0.06;
    else if (kind === 'long') { w = 0.1 + size * 0.03; l = 0.18 + size * 0.06; }
    else if (kind === 'granary') w = l = 0.05 + size * 0.015;
    else if (kind === 'pen') { w = 0.12 + size * 0.04; l = 0.1 + size * 0.03; }
    else { w = 0.12 + size * 0.04; l = 0.15 + size * 0.05; }
    const rad = Math.hypot(w, l) / 2 * (kind === 'round' ? 0.82 : 0.95);
    const p = polar(a, rr);
    if (rr + rad > Rin) continue;
    if (fixed.some((z) => Math.hypot(p[0] - z.u, p[1] - z.v) < z.r + rad)) continue;
    if (plan.streets.some((S) => distSeg(p, S.a, S.b) < S.w / 2 + rad * 0.85 + 0.008) || nearWater(water, p, rad + 0.01)) continue;
    if (houses.some((h) => Math.hypot(p[0] - h.x, p[1] - h.z) < h.rad + rad + 0.012)) continue;
    // the door toward the nearest path, or toward the place when no path is near
    let near = null, nd = 1e9;
    for (const S of plan.streets) { const q = nearestOnSeg(p, S.a, S.b), d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < nd) { nd = d; near = q; } }
    const to = nd < 0.3 ? near : [0, 0];
    houses.push({ kind, x: p[0], z: p[1], rot: facing(to[0] - p[0], to[1] - p[1]) + jit * (kind === 'round' ? 1 : 0.3), w, l, rad, seed: hseed });
  }
  const free = (x, z, rad) => !marks.some((m) => Math.hypot(x - m.u, z - m.v) < m.r + rad * 0.7);
  for (const h of houses) if (free(h.x, h.z, h.rad)) plan.items.push(h);
  // oaks and other trees in the gaps
  const rT = subRng(seed, 6, 3);
  for (let k = 0; k < (major ? 50 : 22); k++) {
    const a = rT() * TAU, rr = Math.sqrt(rT()) * (Rin - 0.04), kind = rT() < 0.7 ? 'oak' : 'tree', tseed = (rT() * 1e9) | 0;
    const p = polar(a, rr);
    if (fixed.some((z) => Math.hypot(p[0] - z.u, p[1] - z.v) < z.r + 0.05) || !free(p[0], p[1], 0.06)) continue;
    if (plan.streets.some((S) => distSeg(p, S.a, S.b) < S.w / 2 + 0.05) || nearWater(water, p, 0.05)) continue;
    if (houses.some((h) => Math.hypot(p[0] - h.x, p[1] - h.z) < h.rad + 0.05)) continue;
    plan.items.push({ kind, x: p[0], z: p[1], rot: 0, seed: tseed });
  }
}

/* ---------- buildings ---------- */
// a round house: wattle and daub under a thatched cone that comes down low
export function roundhouse(add, it, rnd, pal) {
  const r = it.w / 2 * 0.86, h = 0.05 + rnd() * 0.015, rh = r * (1.2 + rnd() * 0.35);
  add(cyl(r, r, h, 10, true), pick(rnd, pal.walls), 0, h / 2, 0);
  add(cone(r * 1.24, rh, 10), pick(rnd, pal.thatch), 0, h - 0.008 + rh / 2, 0);
  add(PANE, pal.door, 0, 0.0225, r - 0.002, { scale: [0.03, 0.045, 1] });
}
// crossed boards at a gable's peak
export function gableCross(add, x, y, z, s) {
  for (const sg of [-1, 1]) add(box(0.004, 0.06 * s, 0.004), '#5a412b', x + sg * 0.01 * s, y, z, { rz: sg * 0.45 });
}
// a long house: low walls under a steep thatched roof, the door in the gable end
export function longhouse(add, it, rnd, pal) {
  const w = it.w * 0.88, l = it.l * 0.9, h = 0.045, rh = w * (0.9 + rnd() * 0.2);
  add(box(w, h, l), pick(rnd, pal.walls), 0, h / 2, 0);
  add(GABLE_ROOF, pick(rnd, pal.thatch), 0, h - 0.006 + rh / 2, 0, { scale: [w * 1.3, rh, l * 1.06] });
  add(PANE, pal.door, 0, 0.0225, l / 2 + 0.004, { scale: [0.034, 0.045, 1] });
  gableCross(add, 0, h + rh - 0.01, l * 0.53, 1);
  for (const sx of [-1, 1]) add(box(0.01, h, 0.01), pal.timber2, sx * w / 2, h / 2, l / 2);
}
// a granary on posts, out of reach of the damp and the mice
export function gaulGranary(add, it, rnd, pal) {
  const s = it.w / 0.06;
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(cyl(0.0035, 0.004, 0.04 * s, 4), pal.timber, x * 0.018 * s, 0.02 * s, z * 0.018 * s);
  add(box(0.05 * s, 0.006, 0.05 * s), pal.timber, 0, 0.04 * s, 0);
  add(box(0.04 * s, 0.035 * s, 0.04 * s), pick(rnd, pal.walls), 0, 0.04 * s + 0.0175 * s, 0);
  add(HIP, pick(rnd, pal.thatch), 0, 0.075 * s + 0.02 * s, 0, { scale: [0.06 * s, 0.04 * s, 0.06 * s] });
}
export function fence(add, w, l, pal, gate = 0) {
  const y = 0.014;
  add(box(w, 0.016, 0.006), pal.fence, 0, y, -l / 2);
  for (const sx of [-1, 1]) add(box(0.006, 0.016, l), pal.fence, sx * w / 2, y, 0);
  if (gate > 0) for (const sx of [-1, 1]) add(box((w - gate) / 2, 0.016, 0.006), pal.fence, sx * (w + gate) / 4, y, l / 2);
  else add(box(w, 0.016, 0.006), pal.fence, 0, y, l / 2);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(box(0.008, 0.03, 0.008), pal.timber2, x * w / 2, 0.015, z * l / 2);
}
export function beast(add, x, z, ry, color, head) {
  const s = sub(add, x, z, ry);
  s(box(0.024, 0.014, 0.014), color, 0, 0.014, 0);
  s(box(0.009, 0.009, 0.009), head, 0.015, 0.018, 0);
  for (const [lx, lz] of [[-0.008, -0.004], [0.008, -0.004], [-0.008, 0.004], [0.008, 0.004]]) s(box(0.003, 0.008, 0.003), head, lx, 0.004, lz);
}
// a pen with sheep or pigs
export function pen(add, it, rnd, pal) {
  const w = it.w * 0.9, l = it.l * 0.9;
  add(box(w, 0.006, l), '#9c8a5c', 0, 0.003, 0);
  fence(add, w, l, pal);
  const sheep = rnd() < 0.6, n = 2 + ((rnd() * 3) | 0);
  for (let k = 0; k < n; k++) beast(add, (rnd() - 0.5) * w * 0.6, (rnd() - 0.5) * l * 0.6, rnd() * TAU, sheep ? pal.wool : pal.pig, sheep ? '#3a3330' : pal.pig);
}
// a garden plot in rows
export function plot(add, it, rnd, pal) {
  const w = it.w * 0.9, l = it.l * 0.9;
  add(box(w, 0.008, l), GREEN.soil, 0, 0.004, 0);
  const n = Math.max(3, Math.round(w / 0.03));
  for (let k = 0; k < n; k++) add(box(0.014, 0.012, l * 0.86), rnd() < 0.8 ? GREEN.crop : pal.hay, -w / 2 + (k + 0.5) * w / n, 0.01, 0);
}
// the place: beaten earth, a well, a few posts
export function place(add, it, rnd, pal) {
  const r = it.w / 2;
  add(cyl(r, r + 0.02, 0.008, 20), pal.place, 0, 0.004, 0);
  add(cyl(0.022, 0.024, 0.026, 10, true), pal.stone, r * 0.3, 0.013, -r * 0.2);
  add(cyl(0.02, 0.02, 0.004, 10), '#3c4a52', r * 0.3, 0.02, -r * 0.2);
  for (let k = 0; k < 3; k++) { const a = rnd() * TAU; add(cyl(0.005, 0.006, 0.07, 5), pal.timber, Math.cos(a) * r * 0.55, 0.035, Math.sin(a) * r * 0.55); }
}
// the chief's hall: a big long house with a porch, carved posts at the door, shields hung along its walls
export function hall(add, it, rnd, pal, big = 1) {
  const w = it.w * 0.9 * big, l = it.l * 0.9 * big, h = 0.07 * big, rh = w * 1.05;
  if (model(add, 'gaul_hall', 0, 0, 0, w * 1.3)) return;
  add(box(w, h, l), pal.walls[0], 0, h / 2, 0);
  add(GABLE_ROOF, pal.thatch[1], 0, h - 0.008 + rh / 2, 0, { scale: [w * 1.28, rh, l * 1.06] });
  gableCross(add, 0, h + rh - 0.012, l * 0.53, 1.4 * big);
  gableCross(add, 0, h + rh - 0.012, -l * 0.53, 1.4 * big);
  add(PANE, pal.door, 0, 0.0325 * big, l / 2 + 0.004, { scale: [0.05 * big, 0.065 * big, 1] });
  // the porch
  const pd = 0.06 * big;
  for (const sx of [-1, 1]) {
    add(cyl(0.006 * big, 0.007 * big, 0.09 * big, 5), pal.timber, sx * 0.05 * big, 0.045 * big, l / 2 + pd);
    add(sph(0.01 * big, 5, 4), pal.timber2, sx * 0.05 * big, 0.095 * big, l / 2 + pd);
  }
  add(GABLE_ROOF, pal.thatch[0], 0, 0.1 * big, l / 2 + pd / 2, { scale: [0.14 * big, 0.04 * big, pd * 1.2] });
  for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) add(cyl(0.014 * big, 0.014 * big, 0.004, 8), pal.plaid[(k + (sx > 0 ? 1 : 0)) % pal.plaid.length], sx * (w / 2 + 0.003), h * 0.6, -l * 0.3 + k * l * 0.3, { rz: Math.PI / 2 });
}
export function gaulHall(add, it, rnd, pal) { hall(add, it, rnd, pal); }
// the capital's hall on its mound, a ramp up to the door
export function greatHall(add, it, rnd, pal) {
  const mh = 0.05;
  add(cyl(0.22, 0.27, mh, 16), pal.earth, 0, mh / 2, 0);
  add(cyl(0.22, 0.22, 0.004, 16), GREEN.lawn, 0, mh + 0.002, 0);
  add(box(0.08, mh * 0.6, 0.12), pal.earth, 0, mh * 0.3, 0.24);
  hall(sub(add, 0, -0.02, 0, mh), it, rnd, pal, 1.15);
}
// the sanctuary: a square ditch and palisade, a gate, the shrine with its gallery, the sacred oak, carved posts
export function sanctuary(add, it, rnd, pal) {
  const S = it.w * 0.7, half = S / 2;
  add(box(S + 0.06, 0.004, S + 0.06), pal.ditch, 0, 0.002, 0);
  add(box(S, 0.008, S), '#a89a70', 0, 0.004, 0);
  const ph = 0.06, t = 0.012;
  add(box(S, ph, t), pal.timber, 0, ph / 2, -half);
  for (const sx of [-1, 1]) {
    add(box(t, ph, S), pal.timber, sx * half, ph / 2, 0);
    add(box(half - 0.035, ph, t), pal.timber, sx * (half / 2 + 0.0175), ph / 2, half);
    add(box(0.012, 0.1, 0.012), pal.timber2, sx * 0.035, 0.05, half);
  }
  add(box(0.09, 0.014, 0.016), pal.timber2, 0, 0.1, half);
  // the shrine: a square cella under its roof, a lower gallery round it
  add(HIP, pal.thatch[3], 0, 0.055, -half * 0.15, { scale: [S * 0.42, 0.04, S * 0.42] });
  add(box(S * 0.2, 0.1, S * 0.2), pal.walls[3], 0, 0.05, -half * 0.15);
  add(HIP, pal.thatch[2], 0, 0.125, -half * 0.15, { scale: [S * 0.27, 0.06, S * 0.27] });
  tree(sub(add, -half * 0.6, -half * 0.6), 0, 0, rnd, 'oak');
  tree(add, half * 0.6, -half * 0.55, rnd, 'oak');
  for (let k = 0; k < 4; k++) {
    const x = (k % 2 ? 1 : -1) * half * 0.55, z = half * (0.15 + Math.floor(k / 2) * 0.3);
    add(cyl(0.005, 0.006, 0.08, 5), pal.timber, x, 0.04, z);
    add(sph(0.009, 5, 4), '#d9cfb8', x, 0.085, z);
  }
}
// a market: stalls under plaid awnings, wine jars from the south, a cart
export function gaulMarket(add, it, rnd, pal) {
  const r = it.w / 2 * 0.9;
  add(cyl(r, r, 0.006, 16), pal.place, 0, 0.003, 0);
  const n = 6;
  for (let k = 0; k < n; k++) {
    const a = k / n * TAU + 0.3, x = Math.cos(a) * r * 0.6, z = Math.sin(a) * r * 0.6;
    stall(add, x, z, Math.atan2(-x, -z), pal.plaid[k % pal.plaid.length], pal.timber);
  }
  amphorae(add, -0.03, -0.02, 9, pal.pot);
  const s = sub(add, r * 0.25, r * 0.3, 0.4);
  s(box(0.06, 0.02, 0.035), pal.timber, 0, 0.03, 0);
  for (const sz of [-1, 1]) s(cyl(0.018, 0.018, 0.005, 10), pal.timber2, 0, 0.02, sz * 0.022, { rz: Math.PI / 2, ry: Math.PI / 2 });
}
// the warriors' hall and its yard, posts to practise on, a rack of spears
export function warhall(add, it, rnd, pal) {
  const r = it.w / 2;
  hall(sub(add, -r * 0.3, 0, 0), { w: r * 0.8, l: r * 1.3 }, rnd, pal);
  const s = sub(add, r * 0.45, 0, 0);
  s(box(r * 0.62, 0.006, r * 1.1), '#a3916a', 0, 0.003, 0);
  fence(s, r * 0.62, r * 1.1, pal, 0.05);
  for (let k = 0; k < 3; k++) s(cyl(0.007, 0.008, 0.06, 5), pal.timber, 0, 0.03, -r * 0.3 + k * r * 0.3);
  for (let k = 0; k < 4; k++) s(cyl(0.002, 0.002, 0.09, 4), '#8a8a8a', -r * 0.2 + k * 0.012, 0.045, r * 0.45, { rz: 0.15 });
}
// a farmyard: granaries, a pen, haystacks and a plot
export function farmyard(add, it, rnd, pal) {
  const r = it.w / 2;
  add(cyl(r * 0.95, r * 0.95, 0.005, 14), '#a8955f', 0, 0.0025, 0);
  for (let k = 0; k < 3; k++) gaulGranary(sub(add, -r * 0.45 + k * r * 0.3, -r * 0.45), { w: 0.06 }, rnd, pal);
  pen(sub(add, r * 0.35, -r * 0.1), { w: r * 0.6, l: r * 0.5 }, rnd, pal);
  plot(sub(add, -r * 0.3, r * 0.35), { w: r * 0.7, l: r * 0.45 }, rnd, pal);
  for (let k = 0; k < 2; k++) {
    const x = r * 0.3 + k * 0.05, z = r * 0.45;
    add(cyl(0.022, 0.024, 0.03, 8), pal.hay, x, 0.015, z);
    add(cone(0.024, 0.03, 8), pal.hay, x, 0.045, z);
  }
}
export const GAUL_BUILD = {
  round: roundhouse, long: longhouse, granary: gaulGranary, pen, plot, place, hall: gaulHall, greatHall,
  sanctuary, market: gaulMarket, warhall, farmyard,
};

/* ---------- walls: a palisade; an earth rampart with the palisade on top; the murus gallicus faced in stone ---------- */
export function gaulWalls(spec, level) {
  const parts = [], add = frame(parts, 0, 0, 0), R = spec.R;
  if (level <= 0) {
    if (spec.major) add(cyl(R + 0.05, R + 0.05, 0.03, 36, true), '#6f5d43', 0, 0.015, 0);
    return { parts, towerTops: [] };
  }
  const ring = wallRing(R, spec.gates, spec.major ? 52 : 34, 0.14);
  const wood = '#7a5a3a', wood2 = '#5e4630', thatch = '#a08550';
  let base = 0;
  if (level >= 2) {
    const hr = level === 2 ? 0.09 : 0.12;
    for (const [a0, a1] of ring.arcs()) {
      if (level === 2) add(ringBand([[R + 0.12, 0], [R + 0.03, hr], [R - 0.04, hr], [R - 0.13, 0]], a0, a1), '#7f7a4c', 0, 0, 0);
      else {
        const n = Math.max(2, Math.round((a1 - a0) / TAU * 56));
        add(cyl(R + 0.035, R + 0.035, hr, n, true, Math.PI / 2 - a1, a1 - a0), '#a59a86', 0, hr / 2, 0);
        add(ringBand([[R + 0.035, hr], [R - 0.04, hr], [R - 0.15, 0]], a0, a1), '#7f7a4c', 0, 0, 0);
      }
    }
    if (level >= 3) for (const S of ring.segs) for (const [o, y] of [[-0.25, 0.35], [0.25, 0.7]]) {
      const ox = -Math.sin(S.a) * o * S.L, oz = Math.cos(S.a) * o * S.L;
      add(box(0.012, 0.012, 0.012), wood2, S.x + ox + Math.cos(S.a) * 0.036, hr * y, S.z + oz + Math.sin(S.a) * 0.036, { ry: S.ry });
    }
    base = hr;
  }
  // the palisade
  const ph = level === 1 ? 0.15 : 0.09;
  for (const S of ring.segs) {
    add(box(S.L, ph, 0.02), wood, S.x, base + ph / 2, S.z, { ry: S.ry });
    for (const o of [-1 / 3, 0, 1 / 3]) {
      const ox = -Math.sin(S.a) * o * S.L, oz = Math.cos(S.a) * o * S.L;
      add(cone(0.011, 0.026, 4), wood, S.x + ox, base + ph + 0.013, S.z + oz);
    }
  }
  // a timber tower over each gate
  const towerTops = [];
  const tower = (x, z, ry, tw, td, th, gate) => {
    const s = sub(add, x, z, ry);
    for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) s(box(0.014, th, 0.014), wood2, px * tw / 2, th / 2, pz * td / 2);
    s(box(tw + 0.02, 0.016, td + 0.02), wood, 0, th - 0.06, 0);
    for (const pz of [-1, 1]) s(box(tw + 0.02, 0.035, 0.008), wood, 0, th - 0.035, pz * (td / 2 + 0.01));
    if (gate) s(GABLE_ROOF, thatch, 0, th + 0.035, 0, { ry: Math.PI / 2, scale: [td + 0.05, 0.07, tw + 0.05] });
    else s(HIP, thatch, 0, th + 0.035, 0, { scale: [tw + 0.05, 0.07, td + 0.05] });
    towerTops.push([x, th + 0.07, z]);
  };
  for (const g of spec.gates) tower(Math.cos(g) * R, Math.sin(g) * R, -(g + Math.PI / 2), ring.gap * R * 2.3, 0.13, base + ph + 0.12, true);
  if (level >= 2) for (const a of ring.towers(level === 2 ? (spec.major ? 4 : 2) : (spec.major ? 6 : 3))) {
    tower(Math.cos(a) * R, Math.sin(a) * R, -(a + Math.PI / 2), 0.09, 0.09, base + ph + 0.1, false);
  }
  return { parts, towerTops };
}
