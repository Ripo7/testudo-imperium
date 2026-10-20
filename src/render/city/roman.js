import { TAU } from '../../core/math.js';
import { cone, cyl, sph } from '../geom.js';
import { GABLE_ROOF, GREEN, HIP, PANE, amphorae, box, cutGrid, frame, gridCity, model, pick, ringTrees, stall, sub, tree, wallRing, wholeBlock } from './kit.js';

/* =========================================================
   Roman towns: a grid laid along the main gate's road, the two main streets crossing at the forum; tall insulae and
   shops near the centre and the main streets, courtyard houses further out, small houses and gardens toward the
   walls; tiled roofs. The forum (with the Capitoline temple once there is a temple), a camp for the barracks,
   granaries for the farmlands; the capital has its amphitheatre.
   ========================================================= */
export const ROMAN_PAL = {
  walls: ['#f1e7d2', '#e9d8b4', '#e6cfa2', '#f3ecdf', '#dcc296'], roofs: ['#c2603b', '#b5532f', '#cf7046', '#ad4c2e', '#c86a3e'],
  street: '#b3a587', main: '#c4b799', door: '#5a4130', window: '#3b2f27', band: '#cdbb98', marble: '#f2ede2', cloth: '#b84a3a', wood: '#7a5a3c',
};

export function romanPlan(plan) {
  gridCity(plan, {
    P: [0.5, 0.5], Ptown: [0.44, 0.44], sw: 0.055, mw: 0.085,
    landmarks: romanLandmarks, cut: romanCut, kind: romanKind,
    trees: (ctx, rnd) => ringTrees(ctx, rnd, ctx.spec.major ? 14 : 6, ['cypress', 'cypress', 'tree']),
  });
}
export function romanLandmarks(ctx) {
  const { spec, plan, Rin, G } = ctx;
  const flag = (uv, y) => { plan.flagAt = [uv[0], y, uv[1]]; };
  if (spec.major) {
    if (ctx.has('forum')) {
      const it = ctx.blocksItem('forum', -1, -1, 0, 0, 's+', { temple: ctx.has('temple') });
      flag(ctx.local(it, -(it.w / 2 - 0.1), -it.l / 2 + 0.1), 0.5);
    } else {
      if (ctx.has('temple')) ctx.blocksItem('temple', -1, 0, -1, 0, 't-');
      plan.items.push({ kind: 'column', x: 0, z: 0, rot: ctx.rot('s+') });
      flag([0, 0], 0.45);
    }
    if (spec.capital) {
      const c = [G(0, -(Rin - 0.5)), G(0, Rin - 0.5), G(-(Rin - 0.5), 0)].find((p) => ctx.clearCircle(p[0], p[1], 0.52)) || G(0, -(Rin - 0.5));
      ctx.circleItem('amphitheatre', c[0], c[1], 0.52, Math.atan2(-c[0], -c[1]));
    }
    const ib = ctx.outer(-1), ia = ctx.outer(0);
    if (ctx.has('barracks')) ctx.firstFit('castra', [[ib, -1, ib, -1, 't+'], [ctx.outer(1), 1, ctx.outer(1), 1, 't-']]);
    if (ctx.has('farm')) ctx.firstFit('horrea', [[ia, 0, ia, 0, 't-'], [ctx.outer(-2), -2, ctx.outer(-2), -2, 't+']]);
  } else {
    const it = ctx.blocksItem(ctx.has('temple') ? 'temple' : 'shrine', 0, 0, 0, 0, 's-');
    flag(ctx.local(it, it.w / 2 - 0.06, it.l / 2 - 0.06), 0.32);
    if (ctx.has('forum')) ctx.blocksItem('market', -1, -1, -1, -1, 't+');
    if (ctx.has('barracks')) ctx.blocksItem('castra', 0, -1, 0, -1, 't+');
    if (ctx.has('farm')) ctx.blocksItem('horrea', -1, 0, -1, 0, 't-');
  }
}
// a block is one courtyard house, two long plots or four small ones
export function romanCut(rnd, B) {
  const x = rnd();
  if (B.d > 0.35 && B.d < 0.8 && x < 0.3) return wholeBlock(B, 'domus');
  if (x < 0.55) return rnd() < 0.5 ? cutGrid(B, 2, 1) : cutGrid(B, 1, 2);
  return cutGrid(B, 2, 2);
}
export function romanKind(rnd, L, ctx) {
  const d = L.block.d, nearMain = Math.abs(L.s) < ctx.Ps * 1.05 || Math.abs(L.t) < ctx.Pt * 1.05, r = rnd();
  if (ctx.spec.major && d < 0.45 && r < 0.55) return 'insula';
  if (ctx.spec.major && nearMain && r < 0.45) return 'shops';
  if (d > 0.7 && r < 0.14) return 'garden';
  return 'house';
}

/* ---------- buildings ---------- */
export function romanHouse(add, it, rnd, pal) {
  const w = it.w * 0.92, l = it.l * 0.92;
  const storeys = rnd() < 0.2 ? 2 : 1, h = storeys === 2 ? 0.17 + rnd() * 0.04 : 0.1 + rnd() * 0.04;
  const wall = pick(rnd, pal.walls), roof = pick(rnd, pal.roofs);
  add(box(w, h, l), wall, 0, h / 2, 0);
  const rh = 0.035 + Math.min(w, l) * 0.2;
  if (rnd() < 0.55) add(HIP, roof, 0, h + rh / 2, 0, { scale: [w * 1.12, rh, l * 1.12] });
  else if (w >= l) add(GABLE_ROOF, roof, 0, h + rh / 2, 0, { ry: Math.PI / 2, scale: [l * 1.14, rh, w * 1.06] });
  else add(GABLE_ROOF, roof, 0, h + rh / 2, 0, { scale: [w * 1.14, rh, l * 1.06] });
  add(PANE, pal.door, (rnd() - 0.5) * w * 0.4, 0.035, l / 2 + 0.004, { scale: [0.045, 0.07, 1] });
  if (storeys === 2) for (const x of [-w * 0.28, w * 0.28]) add(PANE, pal.window, x, h * 0.72, l / 2 + 0.004, { scale: [0.03, 0.035, 1] });
}
// four roofed wings round an open atrium with its rain pool
export function domus(add, it, rnd, pal) {
  const w = it.w * 0.94, l = it.l * 0.94, h = 0.11 + rnd() * 0.03, d = Math.min(w, l) * 0.3;
  const wall = pick(rnd, pal.walls), roof = pick(rnd, pal.roofs), rh = 0.07;
  add(box(w, h, d), wall, 0, h / 2, l / 2 - d / 2);
  add(box(w, h, d), wall, 0, h / 2, -l / 2 + d / 2);
  add(box(d, h, l - 2 * d), wall, w / 2 - d / 2, h / 2, 0);
  add(box(d, h, l - 2 * d), wall, -w / 2 + d / 2, h / 2, 0);
  add(GABLE_ROOF, roof, 0, h + rh / 2, l / 2 - d / 2, { ry: Math.PI / 2, scale: [d * 1.2, rh, w * 1.04] });
  add(GABLE_ROOF, roof, 0, h + rh / 2, -l / 2 + d / 2, { ry: Math.PI / 2, scale: [d * 1.2, rh, w * 1.04] });
  add(GABLE_ROOF, roof, w / 2 - d / 2, h + rh / 2, 0, { scale: [d * 1.2, rh, l - 2 * d] });
  add(GABLE_ROOF, roof, -w / 2 + d / 2, h + rh / 2, 0, { scale: [d * 1.2, rh, l - 2 * d] });
  add(box(w - 2 * d, 0.012, l - 2 * d), '#d9ccb0', 0, 0.006, 0);
  add(box((w - 2 * d) * 0.4, 0.016, (l - 2 * d) * 0.4), '#6f9fb4', 0, 0.01, 0);
  add(PANE, pal.door, 0, 0.04, l / 2 + 0.004, { scale: [0.05, 0.08, 1] });
}
// a block of flats: two or three storeys, a band at each floor, windows, shops opening on the street
export function insula(add, it, rnd, pal) {
  const w = it.w * 0.94, l = it.l * 0.94, n = rnd() < 0.5 ? 2 : 3, fh = 0.09, h = n * fh;
  const wall = pick(rnd, pal.walls), roof = pick(rnd, pal.roofs);
  add(box(w, h, l), wall, 0, h / 2, 0);
  for (let k = 1; k < n; k++) add(box(w + 0.008, 0.01, l + 0.008), pal.band, 0, k * fh, 0);
  const nw = Math.max(1, Math.round(w / 0.085));
  for (let i = 0; i < nw; i++) {
    const x = -w / 2 + (i + 0.5) * w / nw;
    add(PANE, pal.door, x, 0.03, l / 2 + 0.004, { scale: [Math.min(0.05, w / nw * 0.6), 0.055, 1] });
    for (let k = 1; k < n; k++) add(PANE, pal.window, x, k * fh + fh * 0.5, l / 2 + 0.004, { scale: [0.028, 0.035, 1] });
  }
  add(HIP, roof, 0, h + 0.025, 0, { scale: [w * 1.08, 0.05, l * 1.08] });
}
// shops behind a portico on a main street
export function shops(add, it, rnd, pal) {
  const w = it.w * 0.94, l = it.l * 0.94, h = 0.12 + rnd() * 0.02, pd = Math.min(0.07, l * 0.3);
  const wall = pick(rnd, pal.walls), roof = pick(rnd, pal.roofs);
  add(box(w, h, l - pd), wall, 0, h / 2, -pd / 2);
  add(GABLE_ROOF, roof, 0, h + 0.025, -pd / 2, { ry: Math.PI / 2, scale: [(l - pd) * 1.1, 0.05, w * 1.04] });
  const nc = Math.max(2, Math.round(w / 0.07) + 1);
  for (let i = 0; i < nc; i++) add(cyl(0.008, 0.009, h * 0.8, 6), pal.marble, -w / 2 + 0.01 + i * (w - 0.02) / (nc - 1), h * 0.4, l / 2 - 0.012);
  add(box(w, 0.012, pd + 0.01), roof, 0, h * 0.8 + 0.006, l / 2 - pd / 2);
  const nd = Math.max(1, Math.round(w / 0.09));
  for (let i = 0; i < nd; i++) add(PANE, pal.door, -w / 2 + (i + 0.5) * w / nd, 0.03, l / 2 - pd + 0.004, { scale: [0.045, 0.06, 1] });
}
export function garden(add, it, rnd) {
  add(box(it.w * 0.9, 0.01, it.l * 0.9), GREEN.lawn, 0, 0.005, 0);
  const n = 2 + ((rnd() * 3) | 0);
  for (let k = 0; k < n; k++) tree(add, (rnd() - 0.5) * it.w * 0.6, (rnd() - 0.5) * it.l * 0.6, rnd, rnd() < 0.5 ? 'cypress' : 'tree');
}
// a temple on its podium, front (steps) toward +z; s scales it
export function templeBody(add, s, big, pal) {
  if (model(add, 'roman_temple', 0, 0, 0, 0.42 * s)) return;
  const W0 = 0.34 * s, L0 = 0.5 * s, ph = 0.07 * s, ch = 0.2 * s;
  add(box(W0 + 0.06 * s, ph, L0 + 0.08 * s), '#e9e2d2', 0, ph / 2, 0);
  add(box(W0 * 0.7, ph * 0.6, 0.12 * s), '#ddd5c4', 0, ph * 0.3, L0 / 2 + 0.08 * s);
  add(box(W0 * 0.62, ch, L0 * 0.62), '#efe8da', 0, ph + ch / 2, -L0 * 0.08);
  const nc = big ? 6 : 4, nl = big ? 7 : 5;
  for (let i = 0; i < nc; i++) for (let j = 0; j < nl; j++) {
    if (i > 0 && i < nc - 1 && j > 0 && j < nl - 1) continue;
    add(cyl(0.016 * s, 0.019 * s, ch, 6), pal.marble, -W0 / 2 + (i / (nc - 1)) * W0, ph + ch / 2, -L0 / 2 + (j / (nl - 1)) * L0);
  }
  add(box(W0 + 0.05 * s, 0.04 * s, L0 + 0.05 * s), '#efe9de', 0, ph + ch + 0.02 * s, 0);
  add(GABLE_ROOF, '#c86a3e', 0, ph + ch + 0.1 * s, 0, { scale: [W0 + 0.08 * s, 0.12 * s, L0 + 0.08 * s] });
}
// a temple standing in its own precinct: paved court, low wall, an altar before the steps, cypresses
export function temple(add, it, rnd, pal) {
  const w = it.w * 0.96, l = it.l * 0.96, s = Math.min(w / 0.42, l / 0.78);
  add(box(w, 0.012, l), '#e2d9c6', 0, 0.006, 0);
  for (const sx of [-1, 1]) add(box(0.018, 0.05, l), pal.walls[0], sx * (w / 2 - 0.009), 0.025, 0);
  add(box(w, 0.05, 0.018), pal.walls[0], 0, 0.025, -l / 2 + 0.009);
  templeBody(sub(add, 0, -l * 0.08), s, false, pal);
  add(box(0.05, 0.035, 0.035), pal.marble, 0, 0.0175, l / 2 - 0.06);
  for (const sx of [-1, 1]) tree(add, sx * (w / 2 - 0.05), l / 2 - 0.06, rnd, 'cypress');
}
export function shrine(add, it, rnd, pal) { templeBody(add, Math.min(0.62, it.w / 0.42, it.l / 0.7), false, pal); }
// the forum: a paved square with colonnades down both long sides, a column with a gilded statue, the temple at the far
// end looking down it (an altar on a podium until there is a temple) and the basilica across the near end
export function forum(add, it, rnd, pal) {
  const w = it.w, l = it.l;
  add(box(w, 0.016, l), '#e2d9c6', 0, 0.008, 0);
  for (const sx of [-1, 1]) {
    const n = 8;
    for (let k = 0; k < n; k++) add(cyl(0.013, 0.015, 0.13, 6), pal.marble, sx * (w / 2 - 0.05), 0.075, -l / 2 + 0.12 + k * (l - 0.24) / (n - 1));
    add(box(0.09, 0.03, l - 0.16), pal.roofs[1], sx * (w / 2 - 0.035), 0.155, 0);
    add(box(0.06, 0.13, l - 0.16), pal.walls[0], sx * w / 2, 0.065, 0);
  }
  add(cyl(0.022, 0.03, 0.2, 8), pal.marble, 0, 0.11, l * 0.2);
  add(sph(0.032, 6, 4), '#c9a64a', 0, 0.24, l * 0.2);
  if (it.temple) templeBody(sub(add, 0, -l / 2 + 0.27), 0.85, true, pal);
  else {
    add(box(0.26, 0.05, 0.2), '#e9e2d2', 0, 0.025, -l / 2 + 0.2);
    add(box(0.07, 0.05, 0.05), pal.marble, 0, 0.075, -l / 2 + 0.2);
  }
  add(box(w * 0.7, 0.15, 0.18), '#efe6d3', 0, 0.075, l / 2 - 0.12);
  add(GABLE_ROOF, pal.roofs[0], 0, 0.19, l / 2 - 0.12, { ry: Math.PI / 2, scale: [0.22, 0.08, w * 0.74] });
}
// a town's market: a paved square, porticoes on two sides, stalls
export function market(add, it, rnd, pal) {
  const w = it.w * 0.96, l = it.l * 0.96;
  add(box(w, 0.012, l), '#ddd2bc', 0, 0.006, 0);
  for (const sx of [-1, 1]) {
    add(box(0.05, 0.1, l * 0.9), pal.walls[1], sx * (w / 2 - 0.025), 0.05, 0);
    add(box(0.07, 0.012, l * 0.9), pal.roofs[2], sx * (w / 2 - 0.035), 0.106, 0);
    for (let k = 0; k < 5; k++) add(cyl(0.007, 0.008, 0.1, 5), pal.marble, sx * (w / 2 - 0.065), 0.05, -l * 0.4 + k * l * 0.2);
  }
  for (let k = 0; k < 4; k++) stall(add, (k % 2 - 0.5) * w * 0.32, (Math.floor(k / 2) - 0.5) * l * 0.36, Math.PI * (k % 2), k % 3 ? pal.cloth : '#e7dcc0', pal.wood);
  add(cyl(0.035, 0.04, 0.025, 10), pal.marble, 0, 0.0125, 0);
}
// the banner on a column at the crossing, when the city has no forum yet
export function column(add, it, rnd, pal) {
  add(box(0.1, 0.05, 0.1), '#e2d9c6', 0, 0.025, 0);
  add(box(0.06, 0.4, 0.06), pal.marble, 0, 0.25, 0);
}
// a legion's camp: a walled square with its gate on the street, barrack rows either side of the road in, the
// headquarters at the back with the standard before it
export function castra(add, it, rnd, pal) {
  const w = it.w * 0.96, l = it.l * 0.96, h = 0.075, t = 0.024, stone = '#ddd1b6';
  add(box(w, h, t), stone, 0, h / 2, -l / 2 + t / 2);
  for (const sx of [-1, 1]) {
    add(box(t, h, l), stone, sx * (w / 2 - t / 2), h / 2, 0);
    add(box(w / 2 - 0.04, h, t), stone, sx * (w / 4 + 0.02), h / 2, l / 2 - t / 2);
    add(box(0.05, 0.12, 0.05), stone, sx * 0.045, 0.06, l / 2 - t / 2);
    add(HIP, '#b5532f', sx * 0.045, 0.145, l / 2 - t / 2, { scale: [0.07, 0.05, 0.07] });
  }
  add(box(0.06, 0.006, l * 0.7), '#c9bc9f', 0, 0.004, l * 0.12);
  const bw = w / 2 - 0.08;
  for (const sx of [-1, 1]) for (let k = 0; k < 2; k++) {
    const z = l * 0.16 - k * l * 0.3, bl = l * 0.22;
    add(box(bw, 0.06, bl), pal.walls[k], sx * (0.045 + bw / 2), 0.03, z);
    add(GABLE_ROOF, pal.roofs[k + 1], sx * (0.045 + bw / 2), 0.08, z, { ry: Math.PI / 2, scale: [bl * 1.1, 0.04, bw * 1.04] });
  }
  add(box(w * 0.42, 0.09, l * 0.16), '#efe6d3', 0, 0.045, -l / 2 + 0.03 + l * 0.08);
  add(HIP, pal.roofs[0], 0, 0.12, -l / 2 + 0.03 + l * 0.08, { scale: [w * 0.46, 0.06, l * 0.19] });
  add(cyl(0.004, 0.004, 0.16, 4), pal.wood, 0, 0.08, -l * 0.18);
  add(sph(0.012, 5, 4), '#c9a64a', 0, 0.165, -l * 0.18);
}
// granaries: two long halls on raised floors either side of a loading yard
export function horrea(add, it, rnd, pal) {
  const w = it.w * 0.94, l = it.l * 0.94, h = 0.12;
  for (const sx of [-1, 1]) {
    const x = sx * w * 0.3, hw = w * 0.36;
    add(box(hw, h, l), pal.walls[2], x, h / 2, 0);
    add(GABLE_ROOF, pal.roofs[3], x, h + 0.03, 0, { scale: [hw * 1.12, 0.06, l * 1.03] });
    for (let k = 0; k < 4; k++) add(box(0.012, h * 0.85, 0.02), pal.walls[4], x + sx * (hw / 2 + 0.006), h * 0.425, -l * 0.36 + k * l * 0.24);
    add(PANE, pal.door, x, 0.035, l / 2 + 0.004, { scale: [0.05, 0.07, 1] });
  }
  add(box(w * 0.22, 0.006, l), '#c4b799', 0, 0.003, 0);
  amphorae(add, -0.02, l * 0.2, 6, '#b86f45');
}
export function amphitheatre(add) {
  if (model(add, 'amphitheatre', 0, 0, 0, 0.92)) return;
  const ring = (r, h, colr, y0, open) => add(cyl(r, r, h, 22, open), colr, 0, y0 + h / 2, 0, { scale: [1.25, 1, 0.95] });
  ring(0.36, 0.2, '#e6dac2', 0, true);
  ring(0.365, 0.04, '#c8b998', 0.08, true);
  ring(0.37, 0.04, '#c8b998', 0.15, true);
  ring(0.24, 0.12, '#d9cbb0', 0, true);
  ring(0.24, 0.015, '#d8bf86', 0.0, false);
}
export const ROMAN_BUILD = { house: romanHouse, domus, insula, shops, garden, forum, temple, shrine, market, column, castra, horrea, amphitheatre };

/* ---------- walls: dressed stone, round towers with tiled roofs, square gatehouses ---------- */
export function romanWalls(spec, level) {
  const parts = [], add = frame(parts, 0, 0, 0), R = spec.R;
  if (level <= 0) {
    if (spec.major) add(cyl(R + 0.05, R + 0.05, 0.035, 36, true), '#7b6a4c', 0, 0.02, 0);
    return { parts, towerTops: [] };
  }
  const ring = wallRing(R, spec.gates, spec.major ? 40 : 24, 0.17);
  const h = [0, 0.2, 0.3, 0.42][level], t = 0.06 + level * 0.012;
  const stone = level >= 3 ? '#d6cbb2' : '#e0d5bc', stone2 = '#c9bc9f';
  for (const S of ring.segs) {
    add(box(S.L, h, t), stone, S.x, h / 2, S.z, { ry: S.ry });
    add(box(S.L + 0.004, 0.022, t + 0.02), stone2, S.x, h - 0.011, S.z, { ry: S.ry });
    for (const o of [-0.25, 0.25]) {
      const ox = -Math.sin(S.a) * o * S.L, oz = Math.cos(S.a) * o * S.L;
      add(box(S.L * 0.32, 0.045, t * 0.7), stone, S.x + ox + Math.cos(S.a) * t * 0.2, h + 0.022, S.z + oz + Math.sin(S.a) * t * 0.2, { ry: S.ry });
    }
  }
  const nT = level === 1 ? (spec.major ? 4 : 0) : level === 2 ? (spec.major ? 8 : 4) : (spec.major ? 10 : 6);
  const tr = level === 3 ? 0.13 : 0.1, towerTops = [];
  for (const a of ring.towers(nT)) {
    const x = Math.cos(a) * R, z = Math.sin(a) * R, th = h + 0.14;
    add(cyl(tr, tr * 1.12, th, 10), stone, x, th / 2, z);
    if (level === 3) for (let m = 0; m < 6; m++) { const b = m / 6 * TAU; add(box(0.05, 0.05, 0.04), stone, x + Math.cos(b) * tr * 0.9, th + 0.025, z + Math.sin(b) * tr * 0.9, { ry: -b }); }
    else add(cone(tr * 1.35, 0.15, 10), '#b5532f', x, th + 0.075, z);
    const top = th + (level === 3 ? 0.05 : 0.15);
    if (level >= 2 && towerTops.length % 2 === 0) add(cyl(0.006, 0.006, 0.14, 4), '#5b4330', x, top + 0.07, z);
    towerTops.push([x, top, z]);
  }
  for (const g of spec.gates) {
    for (const sgn of [-1, 1]) {
      const a = g + sgn * ring.gap * 1.05, x = Math.cos(a) * R, z = Math.sin(a) * R, th = h + 0.17;
      add(box(0.15, th, 0.15), stone, x, th / 2, z, { ry: -a });
      add(HIP, '#b5532f', x, th + 0.06, z, { ry: -a, scale: [0.2, 0.12, 0.2] });
    }
    add(box(ring.gap * 2.1 * R, 0.07, t + 0.03), stone2, Math.cos(g) * R, h * 0.9 + 0.04, Math.sin(g) * R, { ry: -(g + Math.PI / 2) });
  }
  return { parts, towerTops };
}
