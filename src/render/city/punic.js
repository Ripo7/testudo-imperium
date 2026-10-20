import { TAU } from '../../core/math.js';
import { cone, cyl, sph } from '../geom.js';
import { CAVETTO, GABLE_ROOF, GREEN, PANE, SLAB, amphorae, angDiff, box, cutGrid, flatRoof, frame, gridCity, model, pick, ringBand, ringTrees, stall, sub, tree, wallRing, wholeBlock } from './kit.js';

/* =========================================================
   Punic towns, after Carthage and Kerkouane: a tight grid of narrow streets, whitewashed houses of two to four
   storeys with flat roof terraces, awnings and roof rooms, courtyard houses paved in red. The agora for the forum,
   a temple with its two free-standing pillars and Egyptian cornice, elephant stables for the barracks, warehouses
   for the farmlands; the capital has its citadel hill (the Byrsa) and, on the sea, the round war harbour (the cothon).
   ========================================================= */
export const PUNIC_PAL = {
  walls: ['#f4efe4', '#ece3d0', '#e7d9bd', '#f1e6cf', '#e2d2b3'], cornice: '#d6c4a0', terrace: '#c4ae86',
  door: '#3d4a5c', window: '#34302c', trim: '#b7653f', awning: ['#7a3b5e', '#a8553a', '#4f6788', '#e6dcc4'],
  street: '#bcae8f', main: '#cbbd9c', stone: '#e6dcc6', stone2: '#d3c4a3', marble: '#f2ede2', wood: '#6e5136', water: '#4f7f95',
  pot: '#b0683f', floor: '#b97a63', earth: '#b59f78',
};

export function punicPlan(plan) {
  gridCity(plan, {
    P: [0.36, 0.36], Ptown: [0.34, 0.34], sw: 0.042, mw: 0.07, townGrid: true,
    landmarks: punicLandmarks, cut: punicCut, kind: punicKind,
    trees: (ctx, rnd) => ringTrees(ctx, rnd, ctx.spec.major ? 12 : 5, ['palm', 'palm', 'cypress']),
  });
}
export function punicLandmarks(ctx) {
  const { spec, plan, Rin } = ctx;
  const polar = (a, r) => [Math.cos(a) * r, Math.sin(a) * r], phi = spec.gates[0];
  if (spec.major) {
    // the war harbour on the sea side, the citadel away from it
    if (spec.port && spec.portAng != null) {
      const [u, v] = polar(spec.portAng, Rin - 0.38);
      ctx.circleItem('cothon', u, v, 0.37, spec.portAng + Math.PI / 2);
    }
    if (spec.capital) {
      const away = spec.port && spec.portAng != null ? spec.portAng : phi;
      const cands = [phi + Math.PI + 0.95, phi + Math.PI - 0.95];
      const a = Math.abs(angDiff(cands[0], away)) >= Math.abs(angDiff(cands[1], away)) ? cands[0] : cands[1];
      const alt = cands[0] === a ? cands[1] : cands[0];
      const [u, v] = [polar(a, Rin - 0.44), polar(alt, Rin - 0.44)].find((p) => ctx.clearCircle(p[0], p[1], 0.42)) || polar(a, Rin - 0.44);
      ctx.circleItem('byrsa', u, v, 0.42, Math.atan2(-u, -v));
    }
    if (ctx.has('temple')) ctx.firstFit('temple', [[-3, -1, -2, 0, 's+'], [-2, -1, -2, 0, 's+'], [-2, 1, -1, 2, 't-']], {}, true);
    if (ctx.has('forum')) {
      const it = ctx.firstFit('agora', [[-1, -1, 0, 0, 's+'], [0, -2, 1, -1, 't+']]);
      if (it) ctx.flag(ctx.local(it, -(it.w / 2 - 0.08), -it.l / 2 + 0.08), 0.45);
    }
    if (!ctx.has('forum') || !plan.items.some((it) => it.kind === 'agora')) {
      plan.items.push({ kind: 'pillar', x: 0, z: 0, rot: ctx.rot('s+') });
      ctx.flag([0, 0], 0.42);
    }
    const ib = ctx.outer(-1), ia = ctx.outer(0);
    const ob = ctx.outer(-1, -1), oa = ctx.outer(0, -1);
    if (ctx.has('barracks')) ctx.firstFit('stables', [ib !== null && [ib - 1, -1, ib, -1, 't+'], [ib, -1, ib, -1, 't+'], [ob, -1, ob, -1, 't+']]);
    if (ctx.has('farm')) ctx.firstFit('warehouse', [ia !== null && [ia - 1, 0, ia, 0, 't-'], [ia, 0, ia, 0, 't-'], [oa, 0, oa, 0, 't-']]);
  } else {
    const it = ctx.has('temple') ? ctx.blocksItem('temple', -2, 0, -1, 0, 't-') : ctx.blocksItem('shrine', -1, 0, -1, 0, 't-');
    ctx.flag(ctx.local(it, it.w / 2 - 0.05, it.l / 2 - 0.05), 0.3);
    if (ctx.has('forum')) ctx.blocksItem('agora', 0, -1, 0, -1, 't+');
    if (ctx.has('barracks')) ctx.blocksItem('stables', 0, 0, 0, 0, 't-');
    if (ctx.has('farm')) ctx.blocksItem('warehouse', -1, -1, -1, -1, 't+');
  }
}
// small plots, back to back; now and then a courtyard house takes a whole block
export function punicCut(rnd, B) {
  if (B.d > 0.3 && rnd() < 0.22) return wholeBlock(B, 'court');
  return cutGrid(B, B.hs > 0.12 && rnd() < 0.5 ? 3 : 2, 2);
}
export function punicKind(rnd, L, ctx) {
  const d = L.block.d, nearMain = Math.abs(L.s) < ctx.Ps * 1.05 || Math.abs(L.t) < ctx.Pt * 1.05, r = rnd();
  if (d < 0.42 && r < 0.5) return 'tall';
  if (nearMain && r < 0.42) return 'shops';
  if (d > 0.72 && r < 0.1) return 'garden';
  return 'house';
}

/* ---------- buildings ---------- */
export function punicHouse(add, it, rnd, pal) {
  const w = it.w * 0.93, l = it.l * 0.93, n = rnd() < 0.45 ? 2 : 1, h = n * 0.085 + rnd() * 0.02;
  const wall = pick(rnd, pal.walls);
  add(box(w, h, l), wall, 0, h / 2, 0);
  flatRoof(add, w, l, h, pal.cornice, pal.terrace);
  add(PANE, pal.door, (rnd() - 0.5) * w * 0.4, 0.031, l / 2 + 0.004, { scale: [0.038, 0.062, 1] });
  if (n === 2) add(PANE, pal.window, (rnd() - 0.5) * w * 0.5, h * 0.72, l / 2 + 0.004, { scale: [0.024, 0.028, 1] });
  roofExtras(add, w, l, h, rnd, pal, wall);
}
// a roof room at the back, or an awning on posts over the terrace
export function roofExtras(add, w, l, h, rnd, pal, wall) {
  if (add.far) return;
  const x = rnd();
  if (x < 0.32) {
    const rw = w * 0.45, rl = l * 0.36, rh = 0.055, ox = (rnd() - 0.5) * (w - rw) * 0.8;
    add(box(rw, rh, rl), wall, ox, h + 0.012 + rh / 2, -l / 2 + rl / 2 + 0.015);
    add(box(rw + 0.01, 0.01, rl + 0.01), pal.cornice, ox, h + 0.012 + rh, -l / 2 + rl / 2 + 0.015);
  } else if (x < 0.55) {
    const aw = w * 0.5, ad = l * 0.42, ox = (rnd() - 0.5) * (w - aw) * 0.8;
    add(SLAB, pick(rnd, pal.awning), ox, h + 0.055, 0, { scale: [aw, 0.015, ad] });
    for (const sx of [-1, 1]) add(cyl(0.003, 0.003, 0.05, 4), pal.wood, ox + sx * aw * 0.44, h + 0.035, ad * 0.42);
  }
}
// a tall house of three or four storeys near the centre, a band at each floor
export function punicTall(add, it, rnd, pal) {
  const w = it.w * 0.9, l = it.l * 0.9, n = rnd() < 0.35 ? 4 : 3, fh = 0.078, h = n * fh;
  const wall = pick(rnd, pal.walls);
  add(box(w, h, l), wall, 0, h / 2, 0);
  for (let k = 1; k < n; k++) add(box(w + 0.006, 0.008, l + 0.006), pal.cornice, 0, k * fh, 0);
  flatRoof(add, w, l, h, pal.cornice, pal.terrace);
  add(PANE, pal.door, 0, 0.031, l / 2 + 0.004, { scale: [0.038, 0.062, 1] });
  for (let k = 1; k < n; k++) for (const sx of [-1, 1]) add(PANE, pal.window, sx * w * 0.24, k * fh + fh * 0.5, l / 2 + 0.004, { scale: [0.022, 0.03, 1] });
  roofExtras(add, w, l, h, rnd, pal, wall);
}
// a courtyard house: four flat-roofed wings round a court paved in red, its cistern and a tree
export function punicCourt(add, it, rnd, pal) {
  const w = it.w * 0.94, l = it.l * 0.94, h = 0.13 + rnd() * 0.04, d = Math.min(w, l) * 0.3;
  const wall = pick(rnd, pal.walls);
  const wing = (bw, bl, x, z) => { add(box(bw, h, bl), wall, x, h / 2, z); flatRoof(add, bw, bl, h, pal.cornice, pal.terrace, x, z); };
  wing(w, d, 0, l / 2 - d / 2);
  wing(w, d, 0, -l / 2 + d / 2);
  wing(d, l - 2 * d, w / 2 - d / 2, 0);
  wing(d, l - 2 * d, -w / 2 + d / 2, 0);
  add(box(w - 2 * d, 0.01, l - 2 * d), pal.floor, 0, 0.005, 0);
  add(cyl(0.014, 0.014, 0.014, 8), pal.stone2, (w - 2 * d) * 0.22, 0.007, 0);
  tree(add, -(w - 2 * d) * 0.2, -(l - 2 * d) * 0.15, rnd, rnd() < 0.6 ? 'palm' : 'tree');
  add(PANE, pal.door, 0, 0.033, l / 2 + 0.004, { scale: [0.042, 0.066, 1] });
}
// shops on a main street: open fronts under striped awnings, rooms above
export function punicShops(add, it, rnd, pal) {
  const w = it.w * 0.93, l = it.l * 0.93, h = 0.16 + rnd() * 0.03;
  const wall = pick(rnd, pal.walls);
  add(box(w, h, l), wall, 0, h / 2, 0);
  flatRoof(add, w, l, h, pal.cornice, pal.terrace);
  const n = Math.max(1, Math.round(w / 0.07));
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (i + 0.5) * w / n;
    add(PANE, pal.door, x, 0.0275, l / 2 + 0.004, { scale: [Math.min(0.045, w / n * 0.7), 0.055, 1] });
    add(SLAB, pal.awning[(i + ((rnd() * 4) | 0)) % pal.awning.length], x, 0.07, l / 2 + 0.022, { scale: [w / n * 0.86, 0.016, 0.04] });
  }
  add(PANE, pal.window, 0, h * 0.72, l / 2 + 0.004, { scale: [0.024, 0.028, 1] });
}
export function punicGarden(add, it, rnd, pal) {
  add(box(it.w * 0.9, 0.01, it.l * 0.9), GREEN.lawn, 0, 0.005, 0);
  add(cyl(0.016, 0.016, 0.018, 8), pal.stone2, 0, 0.009, 0);
  const n = 2 + ((rnd() * 2) | 0);
  for (let k = 0; k < n; k++) tree(add, (rnd() - 0.5) * it.w * 0.6, (rnd() - 0.5) * it.l * 0.6, rnd, rnd() < 0.7 ? 'palm' : 'cypress');
}
// a temple building: podium, cella under its flared cornice, the dark doorway and two free-standing pillars
export function punicTempleBody(add, s, pal) {
  if (model(add, 'punic_temple', 0, 0, 0, 0.32 * s)) return;
  const W = 0.26 * s, L = 0.32 * s, ph = 0.05 * s, ch = 0.17 * s;
  add(box(W + 0.05 * s, ph, L + 0.1 * s), pal.stone, 0, ph / 2, 0);
  add(box(W * 0.6, ph * 0.6, 0.08 * s), pal.stone2, 0, ph * 0.3, (L + 0.1 * s) / 2 + 0.03 * s);
  add(box(W, ch, L), pal.marble, 0, ph + ch / 2, -0.02 * s);
  add(box(W + 0.004, 0.012 * s, L + 0.004), pal.trim, 0, ph + ch - 0.008 * s, -0.02 * s);
  add(CAVETTO, pal.stone, 0, ph + ch + 0.016 * s, -0.02 * s, { scale: [W, 0.032 * s, L * 0.92] });
  add(PANE, pal.door, 0, ph + ch * 0.31, L / 2 - 0.02 * s + 0.004, { scale: [W * 0.3, ch * 0.62, 1] });
  for (const sx of [-1, 1]) {
    const x = sx * W * 0.33, z = L / 2 + 0.03 * s;
    add(cyl(0.016 * s, 0.018 * s, ch * 0.95, 8), pal.marble, x, ph + ch * 0.475, z);
    add(box(0.044 * s, 0.022 * s, 0.044 * s), pal.trim, x, ph + ch * 0.95 + 0.011 * s, z);
  }
}
// the precinct: a paved court behind a gate, the temple at the back, the altar, rows of votive stelae, palms
export function punicTemple(add, it, rnd, pal) {
  const w = it.w * 0.96, l = it.l * 0.96;
  add(box(w, 0.012, l), pal.stone, 0, 0.006, 0);
  for (const sx of [-1, 1]) add(box(0.02, 0.06, l), pal.walls[1], sx * (w / 2 - 0.01), 0.03, 0);
  add(box(w, 0.06, 0.02), pal.walls[1], 0, 0.03, -l / 2 + 0.01);
  for (const sx of [-1, 1]) {
    add(box(w / 2 - 0.06, 0.06, 0.02), pal.walls[1], sx * (w / 4 + 0.03), 0.03, l / 2 - 0.01);
    add(box(0.05, 0.12, 0.05), pal.stone, sx * 0.055, 0.06, l / 2 - 0.01);
    add(CAVETTO, pal.stone2, sx * 0.055, 0.128, l / 2 - 0.01, { scale: [0.05, 0.016, 0.05] });
  }
  const s = Math.min(w / 0.36, l / 0.62, 1.5);
  punicTempleBody(sub(add, 0, -l / 2 + 0.03 + 0.22 * s), s, pal);
  add(box(0.06, 0.04, 0.06), pal.stone2, 0, 0.02, l * 0.12);
  for (let k = 0; k < 10; k++) add(box(0.012, 0.03 + (k % 3) * 0.006, 0.006), pal.stone2, w / 2 - 0.05 - (k % 2) * 0.025, 0.018, l * 0.05 + Math.floor(k / 2) * 0.03);
  for (const sx of [-1, 1]) tree(add, sx * (w / 2 - 0.05), l / 2 - 0.07, rnd, 'palm');
}
export function punicShrine(add, it, rnd, pal) {
  const s = Math.min(0.7, it.w / 0.34, it.l / 0.5);
  punicTempleBody(sub(add, 0, -0.04), s, pal);
  add(cone(0.016, 0.06, 6), pal.stone2, it.w * 0.3, 0.03, it.l * 0.3);
}
// the banner on a stele at the crossing, before there is an agora
export function pillar(add, it, rnd, pal) {
  add(box(0.09, 0.04, 0.09), pal.stone2, 0, 0.02, 0);
  add(box(0.055, 0.34, 0.055), pal.stone, 0, 0.21, 0);
  add(CAVETTO, pal.trim, 0, 0.39, 0, { scale: [0.055, 0.02, 0.055] });
}
// the agora: a paved square, a stoa along the back, rows of stalls under coloured awnings, jars of oil and wine
export function agora(add, it, rnd, pal) {
  const w = it.w * 0.97, l = it.l * 0.97;
  add(box(w, 0.014, l), '#ddd1b8', 0, 0.007, 0);
  const sd = Math.min(0.1, l * 0.18);
  add(box(w * 0.9, 0.13, 0.03), pal.walls[1], 0, 0.065, -l / 2 + 0.02);
  add(box(w * 0.9, 0.014, sd), pal.cornice, 0, 0.135, -l / 2 + 0.02 + sd / 2);
  const nc = Math.max(4, Math.round(w * 0.9 / 0.07));
  for (let k = 0; k < nc; k++) add(cyl(0.008, 0.009, 0.13, 6), pal.marble, -w * 0.45 + 0.02 + k * (w * 0.9 - 0.04) / (nc - 1), 0.065, -l / 2 + 0.02 + sd - 0.01);
  const cols = Math.max(2, Math.floor(w / 0.15)), rows = Math.max(1, Math.floor((l - sd) / 0.17));
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const x = -w / 2 + (i + 0.5) * w / cols, z = -l / 2 + sd + 0.06 + (j + 0.5) * (l - sd - 0.1) / rows;
    stall(add, x, z, (j % 2) * Math.PI, pal.awning[(i + j) % pal.awning.length], pal.wood);
  }
  amphorae(add, w * 0.3, l * 0.3, 6, pal.pot);
  amphorae(add, -w * 0.35, l * 0.32, 5, pal.pot);
}
// elephant stables: a long hall with tall stalls opening on a yard, one of the beasts outside
export function stables(add, it, rnd, pal) {
  const w = it.w * 0.95, l = it.l * 0.95, d = l * 0.5, h = 0.14;
  add(box(w, h, d), pal.walls[2], 0, h / 2, -l / 2 + d / 2);
  flatRoof(add, w, d, h, pal.cornice, pal.terrace, 0, -l / 2 + d / 2);
  const n = Math.max(2, Math.round(w / 0.08));
  for (let k = 0; k < n; k++) add(PANE, pal.door, -w / 2 + (k + 0.5) * w / n, 0.05, -l / 2 + d + 0.004, { scale: [0.045, 0.1, 1] });
  add(box(w, 0.008, l - d), pal.earth, 0, 0.004, l / 2 - (l - d) / 2);
  for (const sx of [-1, 1]) add(box(0.012, 0.04, l - d), pal.walls[2], sx * (w / 2 - 0.006), 0.02, l / 2 - (l - d) / 2);
  elephant(sub(add, w * 0.18, l * 0.22, 0.6), '#8f8a82');
  add(box(0.06, 0.025, 0.04), '#a8935c', -w * 0.25, 0.0125, l * 0.25);
}
export function elephant(add, grey) {
  add(sph(0.035, 8, 6), grey, 0, 0.065, 0, { scale: [1, 0.9, 1.45] });
  add(sph(0.024, 7, 5), grey, 0, 0.08, 0.055);
  add(cyl(0.006, 0.009, 0.05, 5), grey, 0, 0.055, 0.075, { ry: Math.PI / 2, rz: 0.3 });
  for (const [x, z] of [[-0.018, -0.03], [0.018, -0.03], [-0.018, 0.03], [0.018, 0.03]]) add(cyl(0.009, 0.009, 0.045, 5), grey, x, 0.0225, z);
  for (const sx of [-1, 1]) add(box(0.004, 0.03, 0.022), grey, sx * 0.024, 0.08, 0.048);
}
// warehouses round a yard: storerooms, stacks of amphorae, sacks of grain
export function warehouse(add, it, rnd, pal) {
  const w = it.w * 0.95, l = it.l * 0.95, h = 0.11, d = Math.min(w, l) * 0.28;
  const wing = (bw, bl, x, z) => { add(box(bw, h, bl), pal.walls[4], x, h / 2, z); flatRoof(add, bw, bl, h, pal.cornice, pal.terrace, x, z); };
  wing(w, d, 0, -l / 2 + d / 2);
  wing(d, l - d, -w / 2 + d / 2, d / 2);
  wing(d, l - d, w / 2 - d / 2, d / 2);
  add(box(w - 2 * d, 0.008, l - d), pal.earth, 0, 0.004, d / 2);
  amphorae(add, -0.03, 0.0, 9, pal.pot);
  for (let k = 0; k < 4; k++) add(sph(0.012, 5, 4), '#d8c8a0', 0.04 + (k % 2) * 0.02, 0.01, l * 0.18 + Math.floor(k / 2) * 0.02, { scale: [1, 0.8, 1] });
  const n = Math.max(2, Math.round(w / 0.09));
  for (let k = 0; k < n; k++) add(PANE, pal.door, -w / 2 + (k + 0.5) * w / n, 0.03, -l / 2 + d + 0.004, { scale: [0.04, 0.06, 1] });
}
// the citadel hill: terraced slopes with houses on the lower ring, a stair up the front, the temple of Eshmun on top
export function byrsa(add, it, rnd, pal) {
  const r = it.w / 2;
  const tiers = [[r * 0.98, r * 0.86, 0.07, pal.earth], [r * 0.66, r * 0.54, 0.09, '#c3ad84'], [r * 0.5, r * 0.42, 0.07, pal.stone2]];
  let y = 0;
  for (const [rb, rt, h, col] of tiers) {
    add(cyl(rt, rb, h, 18), col, 0, y + h / 2, 0);
    add(cyl(rt + 0.004, rt + 0.004, 0.014, 18, true), pal.stone, 0, y + h - 0.004, 0);
    y += h;
  }
  // houses on the lower terrace, leaving the stair free; it faces +z, the houses face outward
  const y1 = tiers[0][2], hr = r * 0.76;
  for (let k = 0; k < 10; k++) {
    const a = (k + 0.5) / 10 * TAU;
    if (Math.abs(angDiff(a, Math.PI / 2)) < 0.4) continue;
    add(box(0.06, 0.055, 0.045), pal.walls[k % 5], Math.cos(a) * hr, y1 + 0.0275, Math.sin(a) * hr, { ry: Math.PI / 2 - a });
  }
  // the stair up the front
  const n = 7;
  for (let k = 0; k < n; k++) { const sh = 0.03 + k * (y - 0.03) / (n - 1); add(box(0.09, sh, 0.05), pal.stone, 0, sh / 2, r * 0.95 - k * (r * 0.5) / (n - 1)); }
  punicTempleBody(sub(add, 0, -0.02, 0, y), 1.05, pal);
  for (const sx of [-1, 1]) tree(sub(add, 0, 0, 0, y), sx * r * 0.32, r * 0.18, rnd, 'cypress');
}
// the round war harbour: a ring of quays round the water, the island in the middle with the admiral's tower and
// the ship sheds radiating from it, a pair of warships at rest
export function cothon(add, it, rnd, pal) {
  const r = it.w / 2 - 0.02;
  add(cyl(r, r, 0.01, 30), pal.water, 0, 0.004, 0);
  add(ringBand([[r + 0.035, 0], [r + 0.035, 0.03], [r, 0.03], [r, 0]], 0, TAU), pal.stone, 0, 0, 0);
  const ri = r * 0.36;
  add(cyl(ri, ri + 0.01, 0.03, 18), pal.stone, 0, 0.015, 0);
  const n = 12;
  for (let k = 0; k < n; k++) {
    const a = k / n * TAU, x = Math.cos(a) * (ri + 0.045), z = Math.sin(a) * (ri + 0.045);
    add(GABLE_ROOF, pal.walls[1], x, 0.035, z, { ry: -a + Math.PI / 2, scale: [0.026, 0.026, 0.08] });
  }
  add(cyl(0.04, 0.046, 0.15, 10), pal.walls[0], 0, 0.105, 0);
  add(CAVETTO, pal.stone2, 0, 0.19, 0, { scale: [0.075, 0.02, 0.075] });
  for (const k of [0, 1]) {
    const a = 0.6 + k * 2.4, x = Math.cos(a) * r * 0.7, z = Math.sin(a) * r * 0.7;
    add(sph(0.5, 8, 5), '#6e4b2e', x, 0.006, z, { ry: -a - Math.PI / 2, scale: [0.13, 0.03, 0.035] });
    add(cyl(0.003, 0.003, 0.07, 4), pal.wood, x, 0.04, z);
  }
}
export const PUNIC_BUILD = {
  house: punicHouse, tall: punicTall, court: punicCourt, shops: punicShops, garden: punicGarden,
  temple: punicTemple, shrine: punicShrine, pillar, agora, stables, warehouse, byrsa, cothon,
};

/* ---------- walls: tall ashlar curtains, square towers with flat crenellated tops; at the third level a fore-wall ---------- */
export function punicWalls(spec, level) {
  const parts = [], add = frame(parts, 0, 0, 0), R = spec.R;
  if (level <= 0) {
    if (spec.major) add(cyl(R + 0.05, R + 0.05, 0.035, 36, true), '#7b6a4c', 0, 0.02, 0);
    return { parts, towerTops: [] };
  }
  const ring = wallRing(R, spec.gates, spec.major ? 40 : 24, 0.16);
  const h = [0, 0.23, 0.33, 0.45][level], t = 0.07 + level * 0.014;
  const stone = level >= 3 ? '#dcd0b4' : '#e4d8be', stone2 = '#cdbd9c';
  const merlons = (x, z, a, L, y, tt) => {
    for (const o of [-1 / 3, 0, 1 / 3]) {
      const ox = -Math.sin(a) * o * L, oz = Math.cos(a) * o * L;
      add(box(L * 0.2, 0.04, tt * 0.7), stone, x + ox + Math.cos(a) * tt * 0.2, y + 0.02, z + oz + Math.sin(a) * tt * 0.2, { ry: -(a + Math.PI / 2) });
    }
  };
  for (const S of ring.segs) {
    add(box(S.L, h, t), stone, S.x, h / 2, S.z, { ry: S.ry });
    add(box(S.L + 0.004, 0.018, t + 0.016), stone2, S.x, h - 0.009, S.z, { ry: S.ry });
    merlons(S.x, S.z, S.a, S.L, h, t);
  }
  if (level >= 3) {
    // the fore-wall, lower, a little way out
    const fore = wallRing(R + 0.16, spec.gates, spec.major ? 44 : 28, 0.2);
    for (const S of fore.segs) add(box(S.L, 0.12, 0.045), stone2, S.x, 0.06, S.z, { ry: S.ry });
  }
  const nT = level === 1 ? (spec.major ? 6 : 2) : level === 2 ? (spec.major ? 10 : 4) : (spec.major ? 12 : 6);
  const tw = 0.13 + level * 0.012, towerTops = [];
  for (const a of ring.towers(nT)) {
    const x = Math.cos(a) * R, z = Math.sin(a) * R, th = h + 0.13;
    add(box(tw, th, tw), stone, x, th / 2, z, { ry: -a });
    add(box(tw + 0.012, 0.018, tw + 0.012), stone2, x, th - 0.009, z, { ry: -a });
    for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const [ox, oz] = [cx * tw * 0.36, cz * tw * 0.36], ca = Math.cos(-a), sa = Math.sin(-a);
      add(box(0.035, 0.04, 0.035), stone, x + ox * ca + oz * sa, th + 0.02, z - ox * sa + oz * ca, { ry: -a });
    }
    if (level >= 2 && towerTops.length % 2 === 0) add(cyl(0.006, 0.006, 0.14, 4), '#5b4330', x, th + 0.07, z);
    towerTops.push([x, th, z]);
  }
  for (const g of spec.gates) {
    for (const sgn of [-1, 1]) {
      const a = g + sgn * ring.gap * 1.05, x = Math.cos(a) * R, z = Math.sin(a) * R, th = h + 0.18;
      add(box(0.16, th, 0.16), stone, x, th / 2, z, { ry: -a });
      add(CAVETTO, stone2, x, th + 0.012, z, { ry: -a, scale: [0.16, 0.024, 0.16] });
    }
    add(box(ring.gap * 2.1 * R, 0.08, t + 0.03), stone2, Math.cos(g) * R, h * 0.9 + 0.04, Math.sin(g) * R, { ry: -(g + Math.PI / 2) });
  }
  return { parts, towerTops };
}
