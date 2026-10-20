import { TAU } from '../../core/math.js';
import { cone, cyl, sph } from '../geom.js';
import { BATTER, CAVETTO, GREEN, HIP, OBELISK, PANE, SLAB, amphorae, box, cutGrid, flatRoof, frame, gridCity, model, pick, ringTrees, stall, sub, taper, tree, wallRing, wholeBlock } from './kit.js';

/* =========================================================
   Egyptian towns, after the Ptolemaic towns of the Fayum: long narrow blocks on a grid, mudbrick houses with flat
   roofs, wind catchers and shades of palm matting, beehive granaries, palm groves. A chapel until there is a temple;
   then the temple with its pylon, obelisks and the avenue of sphinxes down the main street (in the capital the great
   temple with its sacred lake, and on the sea the lighthouse). A Greek market for the forum, a mudbrick fort for the
   barracks, granaries for the farmlands.
   ========================================================= */
export const EGYPT_PAL = {
  walls: ['#dcc69c', '#d2b98d', '#e3d2ae', '#c9ad80', '#ece2cc'], cornice: '#cdb487', terrace: '#b99d6f',
  door: '#4a3726', window: '#3a2c22', stone: '#e9dbb8', stone2: '#d6c39a', hall: '#dcc9a0', paint: ['#3f7f8c', '#b5463a', '#c9a13b'],
  street: '#cdb98f', main: '#d8c7a2', mud: '#b99b6e', mud2: '#a88b60', water: '#4d8aa0', matting: '#a8915e', wood: '#6e5136',
  gold: '#d4ad4a', pot: '#a96a43',
};
const PYLON = taper(0.8, 0.62);

export function egyptPlan(plan) {
  gridCity(plan, {
    P: [0.5, 0.3], Ptown: [0.44, 0.3], sw: 0.045, mw: 0.1, townGrid: true,
    landmarks: egyptLandmarks, cut: egyptCut, kind: egyptKind,
    trees: (ctx, rnd) => ringTrees(ctx, rnd, ctx.spec.major ? 18 : 8, ['palm']),
  });
}
export function egyptLandmarks(ctx) {
  const { spec, plan, Rin, Ps, G } = ctx;
  const polar = (a, r) => [Math.cos(a) * r, Math.sin(a) * r];
  // a temple on the main street's axis, looking down it toward the main gate
  const onAxis = (t) => Math.abs(ctx.toGrid(t.x, t.z)[1]) < 0.05 && Math.abs(Math.atan2(Math.sin(t.rot - ctx.rot('s+')), Math.cos(t.rot - ctx.rot('s+')))) < 0.01;
  // the avenue of sphinxes from the temple's gate toward the main gate, broken at the crossings
  const dromos = (s0) => {
    const s1 = Rin - 0.18;
    if (s1 - s0 < 0.2) return;
    const c = G((s0 + s1) / 2, 0), gaps = [];
    for (let k = 0; k * Ps <= s1 + 0.01; k++) gaps.push(k * Ps - (s0 + s1) / 2);
    plan.items.push({ kind: 'dromos', x: c[0], z: c[1], rot: ctx.rot('s+'), w: ctx.cfg.mw, l: s1 - s0, gaps });
  };
  if (spec.major) {
    let t = null;
    if (spec.capital) t = ctx.firstFit('greatTemple', [[-2, -2, -1, 1, 's+'], [-2, -1, -1, 1, 's+'], [-2, -2, -1, 0, 's+'], [-2, -1, -1, 0, 's+']], { obelisks: ctx.has('temple') }, true);
    else if (ctx.has('temple')) t = ctx.firstFit('pylonTemple', [[-2, -1, -1, 0, 's+'], [-1, -1, -1, 0, 's+']], {}, true);
    if (t) { if (onAxis(t)) dromos(0.07); ctx.flag(ctx.local(t, t.w / 2 - 0.06, t.l / 2 - 0.05), 0.5); }
    else { const c = ctx.blocksItem('chapel', -1, -1, -1, 0, 's+', {}, true); ctx.flag(ctx.local(c, c.w / 2 - 0.05, c.l / 2 - 0.05), 0.42); }
    if (spec.capital && spec.port && spec.portAng != null) {
      const [u, v] = polar(spec.portAng, Rin - 0.22);
      if (ctx.clearCircle(u, v, 0.2)) ctx.circleItem('pharos', u, v, 0.2, spec.portAng + Math.PI);
    }
    if (ctx.has('forum')) ctx.firstFit('market', [[0, -2, 0, -1, 't+'], [0, 0, 0, 1, 't-'], [1, -2, 1, -1, 't+']]);
    const ib = ctx.outer(-1), ia = ctx.outer(0), ob = ctx.outer(1), oc = ctx.outer(-2);
    if (ctx.has('barracks')) ctx.firstFit('garrison', [[ib, -1, ib, -1, 't+'], [ob, 1, ob, 1, 't-'], [oc, -2, oc, -2, 't+']]);
    if (ctx.has('farm')) ctx.firstFit('granary', [[ia, 0, ia, 0, 't-'], [oc, -2, oc, -2, 't+'], [ob, 1, ob, 1, 't-']]);
  } else {
    let t;
    if (ctx.has('temple')) { t = ctx.blocksItem('pylonTemple', -1, -1, -1, 0, 's+', { small: true }, true); if (onAxis(t)) dromos(0.07); }
    else t = ctx.blocksItem('chapel', -1, 0, -1, 0, 't-');
    ctx.flag(ctx.local(t, t.w / 2 - 0.05, t.l / 2 - 0.05), 0.3);
    if (ctx.has('forum')) ctx.blocksItem('market', 0, -1, 0, -1, 't+');
    if (ctx.has('barracks')) ctx.blocksItem('garrison', 0, 0, 0, 0, 't-');
    if (ctx.has('farm')) ctx.blocksItem('granary', 0, 1, 0, 1, 't-');
  }
}
// long blocks of small houses back to back; now and then two courtyard houses
export function egyptCut(rnd, B) {
  if (B.d > 0.3 && rnd() < 0.2) return B.hs > B.ht * 1.3 ? cutGrid(B, 2, 1, 'court') : wholeBlock(B, 'court');
  return cutGrid(B, B.hs > B.ht * 1.3 ? 4 : 2, 2);
}
export function egyptKind(rnd, L) {
  const d = L.block.d, r = rnd();
  if (d < 0.38 && r < 0.42) return 'tall';
  if (r > 0.95) return 'silo';
  if (d > 0.7 && r < 0.14) return 'garden';
  return 'house';
}

/* ---------- buildings ---------- */
export function egyHouse(add, it, rnd, pal) {
  const w = it.w * 0.92, l = it.l * 0.92, n = rnd() < 0.35 ? 2 : 1, h = n * 0.08 + rnd() * 0.02;
  const wall = pick(rnd, pal.walls);
  add(box(w, h, l), wall, 0, h / 2, 0);
  flatRoof(add, w, l, h, pal.cornice, pal.terrace);
  add(PANE, pal.door, (rnd() - 0.5) * w * 0.4, 0.03, l / 2 + 0.004, { scale: [0.036, 0.06, 1] });
  add(PANE, pal.window, (rnd() - 0.5) * w * 0.5, h * 0.82, l / 2 + 0.004, { scale: [0.03, 0.012, 1] });
  egyRoof(add, w, l, h, rnd, pal, wall);
}
// on the roof: a wind catcher open to the north wind, a shade of palm matting on posts, or storage bins
export function egyRoof(add, w, l, h, rnd, pal, wall) {
  if (add.far) return;
  const x = rnd(), y = h + 0.012;
  if (x < 0.3) {
    const ox = (rnd() - 0.5) * w * 0.5;
    add(box(0.04, 0.045, 0.03), wall, ox, y + 0.0225, -l / 2 + 0.03);
    add(SLAB, pal.cornice, ox, y + 0.045, -l / 2 + 0.03, { ry: Math.PI, scale: [0.046, 0.018, 0.036] });
  } else if (x < 0.55) {
    const aw = w * 0.55, ad = l * 0.45;
    add(SLAB, pal.matting, 0, y + 0.045, 0, { scale: [aw, 0.01, ad] });
    for (const sx of [-1, 1]) add(cyl(0.003, 0.003, 0.045, 4), pal.wood, sx * aw * 0.44, y + 0.0225, ad * 0.42);
  } else if (x < 0.65) {
    add(cyl(0.014, 0.016, 0.03, 6, true), pal.mud, 0, y + 0.015, -l * 0.2);
    add(cone(0.015, 0.016, 6), pal.mud, 0, y + 0.038, -l * 0.2);
  }
}
// a tower house of three storeys near the centre, small windows high up
export function egyTall(add, it, rnd, pal) {
  const w = it.w * 0.88, l = it.l * 0.88, h = 0.23 + rnd() * 0.04;
  const wall = pick(rnd, pal.walls);
  add(box(w, h, l), wall, 0, h / 2, 0);
  add(box(w + 0.006, 0.008, l + 0.006), pal.cornice, 0, h * 0.36, 0);
  flatRoof(add, w, l, h, pal.cornice, pal.terrace);
  add(PANE, pal.door, 0, 0.03, l / 2 + 0.004, { scale: [0.036, 0.06, 1] });
  for (const fy of [0.55, 0.82]) for (const sx of [-1, 1]) add(PANE, pal.window, sx * w * 0.22, h * fy, l / 2 + 0.004, { scale: [0.022, 0.016, 1] });
  egyRoof(add, w, l, h, rnd, pal, wall);
}
// a courtyard house: low wings round a court with a palm and a basin
export function egyCourt(add, it, rnd, pal) {
  const w = it.w * 0.94, l = it.l * 0.94, h = 0.09 + rnd() * 0.03, d = Math.min(w, l) * 0.3;
  const wall = pick(rnd, pal.walls);
  const wing = (bw, bl, x, z) => { add(box(bw, h, bl), wall, x, h / 2, z); flatRoof(add, bw, bl, h, pal.cornice, pal.terrace, x, z); };
  wing(w, d, 0, -l / 2 + d / 2);
  wing(d, l - d, -w / 2 + d / 2, d / 2);
  wing(d, l - d, w / 2 - d / 2, d / 2);
  add(box(w - 2 * d, 0.05, 0.016), wall, 0, 0.025, l / 2 - 0.008);
  add(box(w - 2 * d, 0.008, l - d), '#cbb68e', 0, 0.004, d / 2);
  add(box(0.04, 0.012, 0.03), pal.water, (w - 2 * d) * 0.2, 0.008, d / 2);
  tree(add, -(w - 2 * d) * 0.2, d / 2, rnd, 'palm');
  add(PANE, pal.door, 0, 0.025, l / 2 + 0.002, { scale: [0.04, 0.05, 1] });
}
export function egyGarden(add, it, rnd, pal) {
  add(box(it.w * 0.9, 0.01, it.l * 0.9), GREEN.lawn, 0, 0.005, 0);
  add(box(it.w * 0.3, 0.012, it.l * 0.24), pal.water, 0, 0.008, 0);
  const n = 3 + ((rnd() * 3) | 0);
  for (let k = 0; k < n; k++) {
    const a = k / n * TAU + rnd() * 0.5;
    tree(add, Math.cos(a) * it.w * 0.3, Math.sin(a) * it.l * 0.3, rnd, 'palm');
  }
}
export function beehive(add, x, z, r, h, color) {
  add(cyl(r, r * 1.06, h, 8), color, x, h / 2, z);
  add(sph(r, 8, 4), color, x, h, z, { scale: [1, 1.3, 1] });
}
// beehive granaries on a mud platform
export function silo(add, it, rnd, pal) {
  add(box(it.w * 0.8, 0.02, it.l * 0.8), pal.mud2, 0, 0.01, 0);
  const n = 2 + ((rnd() * 2) | 0);
  for (let k = 0; k < n; k++) beehive(add, (k - (n - 1) / 2) * it.w * 0.28, 0, Math.min(0.035, it.w * 0.13), 0.06, pal.mud);
}
// a sphinx couchant, facing +z
export function sphinx(add, color) {
  add(box(0.02, 0.008, 0.046), '#cdb990', 0, 0.004, 0);
  add(box(0.015, 0.016, 0.03), color, 0, 0.016, -0.006);
  add(box(0.013, 0.018, 0.012), color, 0, 0.026, 0.014);
  add(box(0.014, 0.005, 0.014), color, 0, 0.0105, 0.016);
}
export function dromos(add, it, rnd, pal) {
  const n = Math.floor(it.l / 0.075);
  for (let k = 0; k <= n; k++) {
    const z = -it.l / 2 + k * it.l / n;
    if (it.gaps.some((g) => Math.abs(z - g) < 0.06)) continue;
    for (const sx of [-1, 1]) sphinx(sub(add, sx * (it.w / 2 - 0.012), z, -sx * Math.PI / 2), pal.stone);
  }
}
// a pylon: two battered towers under their cornices, the gate between them, flag masts in their niches
export function pylon(add, z, pw, ph, pal, masts = true) {
  if (model(add, 'pylon', 0, 0, z, pw)) return;
  const gw = pw * 0.22, tw = (pw - gw) / 2, pd = 0.07;
  for (const sx of [-1, 1]) {
    const x = sx * (gw / 2 + tw / 2);
    add(PYLON, pal.stone, x, ph / 2, z, { scale: [tw, ph, pd] });
    add(CAVETTO, pal.stone2, x, ph + 0.01, z, { scale: [tw * 0.8, 0.02, pd * 0.62] });
    add(box(tw * 0.82, 0.012, 0.004), pal.paint[0], x, ph * 0.86, z + pd * 0.36);
    if (masts) for (const o of [-0.25, 0.25]) {
      const mx = x + o * tw;
      add(cyl(0.0035, 0.0045, ph * 1.3, 4), pal.wood, mx, ph * 0.65, z + pd / 2 + 0.006);
      add(box(0.03, 0.014, 0.003), pal.paint[1], mx + 0.016, ph * 1.24, z + pd / 2 + 0.006);
    }
  }
  add(box(gw, ph * 0.7, pd * 0.8), pal.stone, 0, ph * 0.35, z);
  add(CAVETTO, pal.stone2, 0, ph * 0.7 + 0.01, z, { scale: [gw, 0.02, pd * 0.8] });
  add(box(gw * 0.5, ph * 0.5, 0.004), pal.door, 0, ph * 0.25, z + pd * 0.4 + 0.002);
}
export function obelisk(add, x, z, h, pal) {
  add(box(0.04, 0.012, 0.04), pal.stone2, x, 0.006, z);
  add(OBELISK, '#d9b98f', x, 0.012 + h / 2, z, { scale: [0.026, h, 0.026] });
  add(HIP, pal.gold, x, 0.012 + h + 0.008, z, { scale: [0.017, 0.016, 0.017] });
}
// a hall under a cavetto cornice, a row of columns before it
export function egyHall(add, z, hw, hl, hh, pal, cols) {
  add(box(hw, hh, hl), pal.hall, 0, hh / 2, z);
  add(CAVETTO, pal.stone2, 0, hh + 0.01, z, { scale: [hw, 0.02, hl] });
  add(box(hw * 1.17, 0.006, hl * 1.28), pal.stone, 0, hh + 0.022, z);
  for (let k = 0; k < cols; k++) {
    const x = -hw / 2 + 0.02 + k * (hw - 0.04) / (cols - 1);
    add(cyl(0.011, 0.012, hh * 0.9, 7), pal.stone2, x, hh * 0.45, z + hl / 2 + 0.018);
    add(cyl(0.017, 0.011, 0.016, 7), pal.paint[k % 2 ? 0 : 2], x, hh * 0.9 + 0.008, z + hl / 2 + 0.018);
  }
  add(box(hw, 0.014, 0.04), pal.stone, 0, hh - 0.007, z + hl / 2 + 0.018);
}
// the temple: its precinct wall, the pylon at the front with obelisks before it, a colonnaded court, the hypostyle
// hall and the sanctuary behind; the great temple has a sacred lake and colossi beside the gate
export function pylonTemple(add, it, rnd, pal, great = false) {
  const w = it.w * 0.97, l = it.l * 0.97, s = it.small ? 0.7 : 1;
  const lake = great && w > 0.8;
  const aw = lake ? Math.min(w * 0.52, 0.56) : w;            // the width of the temple's own axis
  add(box(w, 0.01, l), '#d9c8a2', 0, 0.005, 0);
  const t = 0.035, wh = 0.11 * s;
  add(BATTER, pal.mud, 0, wh / 2, -l / 2 + t / 2, { scale: [w, wh, t] });
  for (const sx of [-1, 1]) add(BATTER, pal.mud, sx * (w / 2 - t / 2), wh / 2, 0, { ry: Math.PI / 2, scale: [l, wh, t] });
  const pw = Math.min(aw * 0.92, 0.6 * s), ph = 0.3 * s, pz = l / 2 - 0.06;
  for (const sx of [-1, 1]) add(BATTER, pal.mud, sx * (w / 2 + pw / 2) / 2, wh / 2, l / 2 - t / 2, { scale: [w / 2 - pw / 2, wh, t] });
  pylon(add, pz, pw, ph, pal);
  if (!it.small) for (const sx of [-1, 1]) obelisk(add, sx * pw * 0.2, pz + 0.075, 0.2, pal);
  if (great && it.obelisks) for (const sx of [-1, 1]) obelisk(add, sx * pw * 0.42, pz + 0.1, 0.17, pal);
  if (great) for (const sx of [-1, 1]) {
    // colossi seated beside the gate
    const x = sx * pw * 0.31, z = pz + 0.05;
    add(box(0.03, 0.03, 0.035), pal.stone2, x, 0.015, z);
    add(box(0.026, 0.05, 0.02), '#d9b98f', x, 0.055, z - 0.008);
    add(box(0.016, 0.02, 0.016), '#d9b98f', x, 0.09, z - 0.006);
    add(box(0.022, 0.012, 0.012), pal.paint[0], x, 0.103, z - 0.006);
  }
  // the court behind the pylon, its colonnades
  const cl = Math.min(l * 0.3, 0.26 * s), cz = pz - 0.04 - cl / 2, cw = pw * 0.86;
  for (const sx of [-1, 1]) for (let k = 0; k < 5; k++) add(cyl(0.01, 0.011, 0.1 * s, 7), pal.stone2, sx * cw / 2, 0.05 * s, cz - cl / 2 + 0.02 + k * (cl - 0.04) / 4);
  for (const sx of [-1, 1]) add(box(0.04, 0.012, cl), pal.hall, sx * cw / 2, 0.106 * s, cz);
  for (const sx of [-1, 1]) add(box(0.012, 0.1 * s, cl), pal.hall, sx * (cw / 2 + 0.022), 0.05 * s, cz);
  // the hypostyle hall and the sanctuary
  const hl = Math.min(l * 0.22, 0.2 * s), hz = cz - cl / 2 - hl / 2 - 0.02;
  egyHall(add, hz, pw * 0.8, hl, 0.13 * s, pal, 6);
  const sl = Math.max(0.06, Math.min(l * 0.14, hz - hl / 2 - (-l / 2 + t) - 0.03)), sz = hz - hl / 2 - sl / 2 - 0.01;
  add(box(pw * 0.5, 0.1 * s, sl), pal.hall, 0, 0.05 * s, sz);
  add(CAVETTO, pal.stone2, 0, 0.1 * s + 0.008, sz, { scale: [pw * 0.5, 0.016, sl] });
  if (lake) {
    // the sacred lake to one side, a palm grove to the other
    const lx = (w / 2 + aw / 2) / 2, lw = w / 2 - aw / 2 - 0.08, ll = l * 0.42;
    add(box(lw + 0.03, 0.016, ll + 0.03), pal.stone, lx, 0.008, -l * 0.08);
    add(box(lw, 0.018, ll), pal.water, lx, 0.01, -l * 0.08);
    for (let k = 0; k < 6; k++) tree(add, -lx + (rnd() - 0.5) * lw * 0.8, -l * 0.3 + rnd() * l * 0.6, rnd, 'palm');
  } else for (const sx of [-1, 1]) tree(add, sx * (w / 2 - 0.05), -l * 0.1, rnd, 'palm');
}
export function greatTemple(add, it, rnd, pal) { pylonTemple(add, it, rnd, pal, true); }
// a chapel: a small pylon before a hall
export function chapel(add, it, rnd, pal) {
  const w = it.w * 0.94, l = it.l * 0.94, pw = Math.min(w * 0.85, 0.3), ph = 0.15;
  add(box(w, 0.008, l), '#d9c8a2', 0, 0.004, 0);
  pylon(add, l / 2 - 0.05, pw, ph, pal, false);
  const hl = Math.max(0.06, l - 0.16);
  egyHall(add, l / 2 - 0.09 - hl / 2, pw * 0.7, hl, 0.1, pal, 4);
  tree(add, w / 2 - 0.04, -l / 2 + 0.05, rnd, 'palm');
}
// a Greek market: a paved square, a stoa along the back, stalls, palms
export function egyMarket(add, it, rnd, pal) {
  const w = it.w * 0.96, l = it.l * 0.96;
  add(box(w, 0.012, l), '#e0d2b2', 0, 0.006, 0);
  const sd = Math.min(0.09, l * 0.2);
  add(box(w * 0.9, 0.12, 0.03), pal.walls[4], 0, 0.06, -l / 2 + 0.02);
  add(box(w * 0.9, 0.014, sd), '#c4603e', 0, 0.127, -l / 2 + 0.02 + sd / 2);
  const nc = Math.max(4, Math.round(w * 0.9 / 0.065));
  for (let k = 0; k < nc; k++) add(cyl(0.008, 0.009, 0.12, 6), '#f2ede2', -w * 0.45 + 0.02 + k * (w * 0.9 - 0.04) / (nc - 1), 0.06, -l / 2 + 0.02 + sd - 0.01);
  for (let k = 0; k < 4; k++) stall(add, (k % 2 - 0.5) * w * 0.4, -l / 2 + sd + 0.08 + Math.floor(k / 2) * 0.12, Math.PI * (k % 2), pick(rnd, [pal.paint[0], pal.matting, '#e8dcc0']), pal.wood);
  amphorae(add, w * 0.28, l * 0.28, 6, pal.pot);
  for (const sx of [-1, 1]) tree(add, sx * (w / 2 - 0.04), l / 2 - 0.05, rnd, 'palm');
}
// a mudbrick fort: battered walls with corner towers, barracks inside, a parade ground
export function garrison(add, it, rnd, pal) {
  const w = it.w * 0.95, l = it.l * 0.95, wh = 0.1, t = 0.03;
  add(box(w, 0.008, l), '#c9b48a', 0, 0.004, 0);
  add(BATTER, pal.mud, 0, wh / 2, -l / 2 + t / 2, { scale: [w, wh, t] });
  for (const sx of [-1, 1]) {
    add(BATTER, pal.mud, sx * (w / 2 - t / 2), wh / 2, 0, { ry: Math.PI / 2, scale: [l, wh, t] });
    add(BATTER, pal.mud, sx * (w / 4 + 0.025), wh / 2, l / 2 - t / 2, { scale: [w / 2 - 0.05, wh, t] });
    for (const sz of [-1, 1]) add(box(0.05, wh + 0.04, 0.05), pal.mud2, sx * (w / 2 - 0.02), (wh + 0.04) / 2, sz * (l / 2 - 0.02));
  }
  const bl = l * 0.5, bw = w * 0.22;
  for (const sx of [-1, 1]) {
    const x = sx * (w / 2 - t - bw / 2 - 0.01);
    add(box(bw, 0.07, bl), pal.walls[1], x, 0.035, -l * 0.08);
    flatRoof(add, bw, bl, 0.07, pal.cornice, pal.terrace, x, -l * 0.08);
  }
  add(box(w * 0.35, 0.09, l * 0.16), pal.walls[3], 0, 0.045, -l / 2 + t + l * 0.09);
  add(cyl(0.004, 0.004, 0.15, 4), pal.wood, 0, 0.075, l * 0.05);
}
// granaries: a walled yard of beehive silos, steps up their sides
export function granary(add, it, rnd, pal) {
  const w = it.w * 0.95, l = it.l * 0.95;
  add(box(w, 0.012, l), pal.mud2, 0, 0.006, 0);
  for (const sx of [-1, 1]) add(box(0.02, 0.05, l), pal.mud, sx * (w / 2 - 0.01), 0.025, 0);
  add(box(w, 0.05, 0.02), pal.mud, 0, 0.025, -l / 2 + 0.01);
  const cols = Math.max(2, Math.floor(w / 0.09)), rows = Math.max(1, Math.floor(l / 0.11));
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) beehive(add, -w / 2 + (i + 0.5) * w / cols, -l / 2 + 0.03 + (j + 0.5) * (l - 0.08) / rows, 0.032, 0.065, j % 2 ? pal.mud : '#c2a477');
}
// the lighthouse: a square tower, an octagon, a drum, the fire and a statue on top
export function pharos(add, it, rnd, pal) {
  if (model(add, 'pharos', 0, 0, 0, 0.32)) return;
  add(box(0.3, 0.03, 0.3), pal.stone2, 0, 0.015, 0);
  add(taper(0.86, 0.86), '#ece4d0', 0, 0.03 + 0.16, 0, { scale: [0.17, 0.32, 0.17] });
  add(CAVETTO, pal.stone, 0, 0.36, 0, { scale: [0.15, 0.02, 0.15] });
  add(cyl(0.055, 0.06, 0.14, 8), '#ece4d0', 0, 0.44, 0);
  add(cyl(0.035, 0.038, 0.07, 10), '#ece4d0', 0, 0.545, 0);
  add(sph(0.02, 6, 4), '#f0b04a', 0, 0.59, 0);
  add(cyl(0.004, 0.005, 0.06, 4), pal.gold, 0, 0.63, 0);
}
export const EGYPT_BUILD = {
  house: egyHouse, tall: egyTall, court: egyCourt, garden: egyGarden, silo, dromos, pylonTemple, greatTemple, chapel,
  market: egyMarket, garrison, granary, pharos,
};

/* ---------- walls: thick battered mudbrick, rectangular bastions; whitewashed and painted at the third level; pylon gates ---------- */
export function egyptWalls(spec, level) {
  const parts = [], add = frame(parts, 0, 0, 0), R = spec.R;
  if (level <= 0) {
    if (spec.major) add(cyl(R + 0.05, R + 0.05, 0.035, 36, true), '#8a7656', 0, 0.02, 0);
    return { parts, towerTops: [] };
  }
  const ring = wallRing(R, spec.gates, spec.major ? 40 : 24, 0.16);
  const h = [0, 0.2, 0.29, 0.38][level], t = 0.1 + level * 0.016;
  const mud = level >= 3 ? '#e6dcc4' : '#b99b6e', mud2 = level >= 3 ? '#cfc1a2' : '#a88b60';
  for (const S of ring.segs) {
    add(BATTER, mud, S.x, h / 2, S.z, { ry: S.ry, scale: [S.L, h, t] });
    add(box(S.L + 0.004, 0.014, t * 0.6 + 0.012), mud2, S.x, h - 0.007, S.z, { ry: S.ry });
    if (level >= 3) add(box(S.L + 0.002, 0.012, t * 0.62 + 0.016), '#3f7f8c', S.x, h - 0.03, S.z, { ry: S.ry });
    for (const o of [-1 / 3, 0, 1 / 3]) {
      const ox = -Math.sin(S.a) * o * S.L, oz = Math.cos(S.a) * o * S.L;
      add(box(S.L * 0.2, 0.034, t * 0.4), mud, S.x + ox + Math.cos(S.a) * t * 0.12, h + 0.017, S.z + oz + Math.sin(S.a) * t * 0.12, { ry: S.ry });
    }
  }
  const nT = level === 1 ? (spec.major ? 6 : 2) : level === 2 ? (spec.major ? 10 : 4) : (spec.major ? 12 : 6);
  const towerTops = [];
  for (const a of ring.towers(nT)) {
    const x = Math.cos(a) * (R + 0.03), z = Math.sin(a) * (R + 0.03), th = h + 0.1;
    add(BATTER, mud, x, th / 2, z, { ry: -(a + Math.PI / 2), scale: [0.13, th, 0.17] });
    add(box(0.12, 0.016, 0.11), mud2, x, th - 0.008, z, { ry: -(a + Math.PI / 2) });
    if (level >= 2 && towerTops.length % 2 === 0) add(cyl(0.006, 0.006, 0.14, 4), '#5b4330', x, th + 0.07, z);
    towerTops.push([x, th, z]);
  }
  for (const g of spec.gates) {
    for (const sgn of [-1, 1]) {
      const a = g + sgn * ring.gap * 1.08, x = Math.cos(a) * R, z = Math.sin(a) * R, th = h + 0.16;
      add(PYLON, mud, x, th / 2, z, { ry: -(a + Math.PI / 2), scale: [0.15, th, 0.17] });
      add(CAVETTO, mud2, x, th + 0.01, z, { ry: -(a + Math.PI / 2), scale: [0.12, 0.02, 0.105] });
    }
    add(box(ring.gap * 2.1 * R, 0.07, t * 0.7), mud2, Math.cos(g) * R, h * 0.9 + 0.035, Math.sin(g) * R, { ry: -(g + Math.PI / 2) });
  }
  return { parts, towerTops };
}
