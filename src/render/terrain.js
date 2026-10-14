import { THREE } from '../three.js';
import { MAP } from '../game/state.js';
import { clamp, isTouch, lerp, mulberry32, smooth } from '../core/util.js';
import { BIOME, fbm, makePerlin, N8 } from '../map/generate.js';
import { renderer } from './renderer.js';
import { BORDER_U, elevToHeight, refreshBorders, worldGroup } from './world.js';
import { CAM } from './camera.js';
import { buildSeaTexture } from './water.js';
import { FACTIONS } from '../game/data.js';
import { UI } from '../ui/state.js';
import { DISPUTED, placesOf } from '../game/standing.js';

/* =========================================================
   Painted terrain: fine relief, hand-painted albedo, brush detail,
   cliffs & snow in the shader, territory colours on top.
   ========================================================= */
export const RS = 2;
// render vertices per cell
export let FW = 0, FH = 0, HF = null;
// fine height grid
export let terrainColors = null, ownCol = null, ownK = null, fineProv = null;
export let albedoTex = null;

export function heightAt(x, y) {
  x = clamp(x, 0, MAP.W - 1.001) * RS; y = clamp(y, 0, MAP.H - 1.001) * RS;
  const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, i = y0 * FW + x0;
  return (HF[i] * (1 - fx) + HF[i + 1] * fx) * (1 - fy) + (HF[i + FW] * (1 - fx) + HF[i + FW + 1] * fx) * fy;
}

/* ---------- small noise helpers ---------- */
export function gridNoise(nw, nh, fn) { const g = new Float32Array(nw * nh); for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) g[y * nw + x] = fn(x, y); return g; }
export function sampleGrid(g, nw, nh, x, y) {
  x = clamp(x, 0, nw - 1.001); y = clamp(y, 0, nh - 1.001);
  const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, i = y0 * nw + x0;
  return (g[i] * (1 - fx) + g[i + 1] * fx) * (1 - fy) + (g[i + nw] * (1 - fx) + g[i + nw + 1] * fx) * fy;
}
export const cr = (p0, p1, p2, p3, t) => p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));

/* ---------- relief ---------- */
export function buildHeights() {
  const { W, H, elev, biome, river, seed } = MAP;
  FW = (W - 1) * RS + 1; FH = (H - 1) * RS + 1;
  const HC = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) HC[i] = elevToHeight(elev[i]);
  // how rugged each cell is (smoothed so mountains rise gradually)
  const rough0 = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const b = biome[i];
    rough0[i] = b === BIOME.SNOW ? 1.25 : b === BIOME.MOUNTAIN ? 1 : b === BIOME.HILLS ? 0.32 : 0;
    if (river[i]) rough0[i] = 0;
  }
  const rough = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let s = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; s += rough0[yy * W + xx]; n++; }
    rough[y * W + x] = Math.min(rough0[y * W + x], s / n) * 0.5 + rough0[y * W + x] * 0.5;
  }
  const pr = makePerlin(seed + 404), pw = makePerlin(seed + 405), pc = makePerlin(seed + 406);
  const C = (x, y) => HC[clamp(y, 0, H - 1) * W + clamp(x, 0, W - 1)];
  HF = new Float32Array(FW * FH);
  for (let j = 0; j < FH; j++) for (let i = 0; i < FW; i++) {
    const x = i / RS, y = j / RS;
    const x0 = Math.floor(x), y0 = Math.floor(y), tx = x - x0, ty = y - y0;
    let h;
    if (tx === 0 && ty === 0) h = C(x0, y0);
    else {
      const row = (yy) => cr(C(x0 - 1, yy), C(x0, yy), C(x0 + 1, yy), C(x0 + 2, yy), tx);
      h = cr(row(y0 - 1), row(y0), row(y0 + 1), row(y0 + 2), ty);
    }
    // cell centres keep the map's land/sea status; in between, the coast wanders a little
    if (tx === 0 && ty === 0) { if (elev[y0 * W + x0] >= 0) h = Math.max(h, 0.07); else h = Math.min(h, -0.04); }
    else if (Math.abs(h) < 0.45) h += pc(x * 0.8, y * 0.8) * 0.16 + pc(x * 2.1 + 7, y * 2.1) * 0.06;
    const rg = sampleGrid(rough, W, H, x, y);
    if (rg > 0.01 && h > 0) {
      // ridged multifractal with a little domain warp: sharp crests, carved valleys
      const wx = x + pw(x * 0.21, y * 0.21) * 2.2, wy = y + pw(x * 0.21 + 40, y * 0.21 + 40) * 2.2;
      let a = 1, f = 0.3, s = 0, nrm = 0, prev = 1;
      for (let o = 0; o < 4; o++) {
        let r = 1 - Math.abs(pr(wx * f, wy * f) * 1.35); r *= r;
        s += r * a * prev; nrm += a; prev = clamp(r * 1.4, 0, 1); a *= 0.5; f *= 2.1;
      }
      h += rg * (s / nrm - 0.32) * 2.6;
    } else if (h > 0) h += pr(x * 0.45 + 9, y * 0.45 + 3) * 0.06;   // gentle roll on lowlands
    HF[j * FW + i] = h;
  }
  // rivers sit in a shallow bed
  for (const rv of MAP.rivers) {
    for (let k = 0; k < rv.length - 1; k++) {
      const ax = rv[k] % W, ay = (rv[k] / W) | 0, bx = rv[k + 1] % W, by = (rv[k + 1] / W) | 0;
      for (let s = 0; s <= 4; s++) {
        const px = lerp(ax, bx, s / 4), py = lerp(ay, by, s / 4);
        const base = Math.max(0.05, Math.min(C(ax, ay), C(bx, by)) - 0.04);
        for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
          const fi = Math.round(px * RS) + di, fj = Math.round(py * RS) + dj;
          if (fi < 0 || fj < 0 || fi >= FW || fj >= FH) continue;
          const d = Math.hypot(fi / RS - px, fj / RS - py);
          if (d > 0.75) continue;
          const v = fj * FW + fi;
          if (HF[v] > base) HF[v] = lerp(base, HF[v], smooth(0.25, 0.75, d));
        }
      }
    }
  }
  // cities stand on levelled ground
  for (const c of MAP.cities) {
    const h0 = Math.max(0.15, HC[c.cell]);
    const R = c.major ? 2.8 : 1.8;
    for (let fj = Math.floor((c.y - R) * RS); fj <= Math.ceil((c.y + R) * RS); fj++) for (let fi = Math.floor((c.x - R) * RS); fi <= Math.ceil((c.x + R) * RS); fi++) {
      if (fi < 0 || fj < 0 || fi >= FW || fj >= FH) continue;
      const d = Math.hypot(fi / RS - c.x, fj / RS - c.y);
      const v = fj * FW + fi;
      if (HF[v] <= 0) continue;
      HF[v] = lerp(h0, HF[v], smooth(R * 0.68, R, d));
    }
  }
}

/* ---------- tiling detail texture: brush strokes, sand ripples, rock strata, blotches ---------- */
export let DETAIL_TEX = null;
export function buildDetailTexture() {
  const S = 512, N = S * S, rnd = mulberry32(31337);
  const wrap = (v) => ((v % S) + S) % S;
  const pnoise = (period, seed) => {
    const r = mulberry32(seed), g = new Float32Array(period * period);
    for (let i = 0; i < g.length; i++) g[i] = r();
    return (x, y) => {
      const fx = x / S * period, fy = y / S * period, x0 = Math.floor(fx), y0 = Math.floor(fy);
      let tx = fx - x0, ty = fy - y0; tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
      const X0 = ((x0 % period) + period) % period, X1 = (X0 + 1) % period, Y0 = ((y0 % period) + period) % period, Y1 = (Y0 + 1) % period;
      return lerp(lerp(g[Y0 * period + X0], g[Y0 * period + X1], tx), lerp(g[Y1 * period + X0], g[Y1 * period + X1], tx), ty);
    };
  };
  const n4 = pnoise(4, 11), n8 = pnoise(8, 12), n16 = pnoise(16, 13), n32 = pnoise(32, 14), n64 = pnoise(64, 15);
  // R: painterly grass strokes (light and dark dabs, mostly leaning one way)
  const R = new Float32Array(N).fill(0.5);
  for (let k = 0; k < 3400; k++) {
    const cx = rnd() * S, cy = rnd() * S;
    const ang = -0.95 + (rnd() + rnd() + rnd() - 1.5) * 0.8, len = 9 + rnd() * 18, wid = 2.2 + rnd() * 3.2;
    const dv = (rnd() < 0.5 ? -1 : 1) * (0.06 + rnd() * 0.14);
    const dx = Math.cos(ang) * len, dy = Math.sin(ang) * len;
    const x0 = Math.floor(Math.min(cx, cx + dx) - wid - 1), x1 = Math.ceil(Math.max(cx, cx + dx) + wid + 1);
    const y0 = Math.floor(Math.min(cy, cy + dy) - wid - 1), y1 = Math.ceil(Math.max(cy, cy + dy) + wid + 1);
    const L2 = dx * dx + dy * dy;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x + 0.5 - cx, py = y + 0.5 - cy;
      const t = clamp((px * dx + py * dy) / L2, 0, 1);
      const ex = px - dx * t, ey = py - dy * t, d = Math.sqrt(ex * ex + ey * ey);
      const w = wid * (0.55 + 0.45 * Math.sin(Math.PI * t));
      if (d >= w) continue;
      R[wrap(y) * S + wrap(x)] += dv * (1 - d / w);
    }
  }
  const data = new Uint8Array(N * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x;
    // G: wind ripples on sand (asymmetric crests, warped)
    const warp = n8(x, y) * 2.4 + n16(x, y) * 0.9;
    const ph = (x * 3 + y * 19) / S * Math.PI * 2 + warp * 2.2;
    let rip = 0.5 + 0.5 * Math.sin(ph); rip = Math.pow(rip, 1.8);
    const G = 0.32 + rip * 0.45 + (n64(x, y) - 0.5) * 0.25;
    // B: rock strata: horizontal layers with wobble, cracks and grit
    const f = y / S * 9 + (n4(x, y) - 0.5) * 2.6 + (n16(x, y) - 0.5) * 0.7;
    const fr = f - Math.floor(f), layer = Math.floor(f);
    const shade = 0.75 + 0.5 * (((layer * 7919) % 13) / 13);
    let B = (0.34 + 0.3 * smooth(0, 0.1, fr) * (1 - smooth(0.55, 1, fr))) * shade + (n32(x, y) - 0.5) * 0.3 + (n64(x, y) - 0.5) * 0.2;
    const crack = Math.abs(n16(x * 1.7, y) - 0.5);
    if (crack < 0.018) B -= 0.22 * (1 - crack / 0.018);
    // A: soft blotches for colour variation
    const A = n4(x, y) * 0.5 + n8(x, y) * 0.3 + n16(x, y) * 0.2;
    data[i * 4] = clamp(R[i], 0, 1) * 255; data[i * 4 + 1] = clamp(G, 0, 1) * 255; data[i * 4 + 2] = clamp(B, 0, 1) * 255; data[i * 4 + 3] = clamp(A, 0, 1) * 255;
  }
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  t.needsUpdate = true;
  DETAIL_TEX = t;
}

/* ---------- the painted albedo (one texture for the whole continent) ---------- */
export const PAL = {
  lush: [78, 136, 44], dry: [146, 152, 62], lushB: [100, 150, 46], dryB: [168, 162, 74],
  steppe: [184, 164, 86], steppeB: [164, 150, 78],
  forest: [48, 84, 34], forestB: [66, 100, 40],
  desert: [228, 186, 108], desertB: [210, 158, 86],
  beach: [232, 210, 150],
  hills: [118, 136, 62], hillsB: [148, 142, 80],
  mount: [124, 128, 92], mountB: [112, 106, 86], mountHi: [150, 138, 118],
  snow: [240, 244, 248],
  shallow: [214, 200, 146], mid: [52, 146, 150], deep: [24, 72, 104],
  bank: [84, 140, 56],
  urban: [176, 156, 120], wheat: [222, 186, 84], green: [124, 170, 66], plowed: [148, 108, 66], fallow: [184, 176, 98], hedge: [62, 94, 40],
};
export function paintAlbedo() {
  const { W, H, biome, river, moist, elev, seed } = MAP;
  const TW = isTouch ? 1536 : 2048, TH = TW / 2;
  const NR = 3, NW = (W - 1) * NR + 1, NH = (H - 1) * NR + 1;
  const p1 = makePerlin(seed + 501), p2 = makePerlin(seed + 502), p3 = makePerlin(seed + 503);
  const gWX = gridNoise(NW, NH, (x, y) => fbm(p1, x / NR * 0.42, y / NR * 0.42, 2));
  const gWY = gridNoise(NW, NH, (x, y) => fbm(p1, x / NR * 0.42 + 71, y / NR * 0.42 + 13, 2));
  const gV = gridNoise(NW, NH, (x, y) => 0.5 + fbm(p2, x / NR * 0.08, y / NR * 0.08, 3));
  const gT = gridNoise(NW, NH, (x, y) => clamp(0.5 + p3(x / NR * 0.33, y / NR * 0.33) * 1.3, 0, 1));
  const urban = new Int16Array(W * H).fill(-1);
  for (const c of MAP.cities) for (let y = Math.max(0, c.y - 2); y <= Math.min(H - 1, c.y + 2); y++) for (let x = Math.max(0, c.x - 2); x <= Math.min(W - 1, c.x + 2); x++) urban[y * W + x] = c.id;
  const img = new Float32Array(TW * TH * 4);
  const col = [0, 0, 0];
  const mix3 = (a, b, t) => { col[0] = a[0] + (b[0] - a[0]) * t; col[1] = a[1] + (b[1] - a[1]) * t; col[2] = a[2] + (b[2] - a[2]) * t; };
  for (let py = 0; py < TH; py++) {
    const y = (py + 0.5) / TH * (H - 1);
    for (let px = 0; px < TW; px++) {
      const x = (px + 0.5) / TW * (W - 1);
      const gx = x * NR, gy = y * NR;
      const wx = sampleGrid(gWX, NW, NH, gx, gy), wy = sampleGrid(gWY, NW, NH, gx, gy);
      const v = sampleGrid(gV, NW, NH, gx, gy), tt = sampleGrid(gT, NW, NH, gx, gy);
      const bx = clamp(Math.round(x + wx * 1.1), 0, W - 1), by = clamp(Math.round(y + wy * 1.1), 0, H - 1);
      const ci = by * W + bx;
      let b = biome[ci];
      const e = sampleGrid(elev, W, H, x, y);
      let sand = 0;
      if (e < 0.0 && (b === BIOME.SEA || b === BIOME.DEEP || b === BIOME.LAKE || b === BIOME.BEACH)) {
        const t1 = clamp(-e * 11, 0, 1), t2 = clamp((-e - 0.07) * 7, 0, 1);
        if (!MAP.ocean[ci] && b !== BIOME.SEA && b !== BIOME.DEEP) { mix3(PAL.bank, PAL.mid, t1 * 0.7); sand = 0.2; }
        else { mix3(PAL.shallow, PAL.mid, t1); const m = [col[0], col[1], col[2]]; mix3(m, PAL.deep, t2); sand = 1; }
      } else {
        if (b === BIOME.SEA || b === BIOME.DEEP || b === BIOME.LAKE) b = BIOME.BEACH;
        switch (b) {
          case BIOME.PLAINS: {
            const m = clamp((sampleGrid(moist, W, H, x, y) - 0.38) * 2.6, 0, 1);
            const a = [lerp(PAL.dry[0], PAL.lush[0], m), lerp(PAL.dry[1], PAL.lush[1], m), lerp(PAL.dry[2], PAL.lush[2], m)];
            const c2 = [lerp(PAL.dryB[0], PAL.lushB[0], m), lerp(PAL.dryB[1], PAL.lushB[1], m), lerp(PAL.dryB[2], PAL.lushB[2], m)];
            mix3(a, c2, tt); sand = (1 - m) * 0.15; break;
          }
          case BIOME.STEPPE: mix3(PAL.steppe, PAL.steppeB, tt); sand = 0.45; break;
          case BIOME.FOREST: mix3(PAL.forest, PAL.forestB, tt); break;
          case BIOME.DESERT: mix3(PAL.desert, PAL.desertB, tt); sand = 1; break;
          case BIOME.BEACH: mix3(PAL.beach, PAL.desert, tt * 0.4); sand = 1; break;
          case BIOME.HILLS: mix3(PAL.hills, PAL.hillsB, tt); sand = 0.1; break;
          case BIOME.MOUNTAIN: { mix3(PAL.mount, PAL.mountB, tt); const hi = clamp((e - MAP.eMount) / Math.max(0.01, MAP.eSnow - MAP.eMount), 0, 1); col[0] = lerp(col[0], PAL.mountHi[0], hi); col[1] = lerp(col[1], PAL.mountHi[1], hi); col[2] = lerp(col[2], PAL.mountHi[2], hi); break; }
          default: mix3(PAL.snow, PAL.mount, tt * 0.12); break;
        }
        if (river[ci] && b !== BIOME.DESERT) { col[0] = lerp(col[0], PAL.bank[0], 0.45); col[1] = lerp(col[1], PAL.bank[1], 0.45); col[2] = lerp(col[2], PAL.bank[2], 0.45); }
        // packed earth and paving inside towns
        const cc = urban[clamp(Math.round(y), 0, H - 1) * W + clamp(Math.round(x), 0, W - 1)];
        if (cc >= 0) {
          const c = MAP.cities[cc], R = c.major ? 1.55 : 0.85;
          const d = Math.hypot(x - c.x, y - c.y) + (v - 0.5) * 0.5 + (tt - 0.5) * 0.25;
          const w = (1 - smooth(R * 0.7, R, d)) * (c.major ? 0.9 : 0.7);
          if (w > 0) { col[0] = lerp(col[0], PAL.urban[0], w); col[1] = lerp(col[1], PAL.urban[1], w); col[2] = lerp(col[2], PAL.urban[2], w); sand *= 1 - w; }
        }
      }
      const k = 0.9 + 0.2 * v;
      const o = (py * TW + px) * 4;
      img[o] = col[0] * k; img[o + 1] = col[1] * k; img[o + 2] = col[2] * k; img[o + 3] = sand * 255;
    }
  }
  // soften the pixel edges a touch (separable 1-2-1 blur)
  const tmp = new Float32Array(img.length);
  for (let py = 0; py < TH; py++) for (let px = 0; px < TW; px++) {
    const l = Math.max(0, px - 1), r = Math.min(TW - 1, px + 1), o = (py * TW + px) * 4;
    for (let c = 0; c < 4; c++) tmp[o + c] = (img[(py * TW + l) * 4 + c] + 2 * img[o + c] + img[(py * TW + r) * 4 + c]) * 0.25;
  }
  const data = new Uint8Array(img.length);
  for (let py = 0; py < TH; py++) for (let px = 0; px < TW; px++) {
    const u = Math.max(0, py - 1), d = Math.min(TH - 1, py + 1), o = (py * TW + px) * 4;
    for (let c = 0; c < 4; c++) data[o + c] = clamp((tmp[(u * TW + px) * 4 + c] + 2 * tmp[o + c] + tmp[(d * TW + px) * 4 + c]) * 0.25, 0, 255);
  }
  if (albedoTex) albedoTex.dispose();
  const t = new THREE.DataTexture(data, TW, TH, THREE.RGBAFormat);
  t.encoding = THREE.sRGBEncoding;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  albedoTex = t;
}

/* ---------- material ---------- */
export const TERR_U = {
  uTint: { value: 0.3 }, uEdge: { value: 0.4 }, uNeu: { value: 0.15 }, uLum: { value: 0.3 },
  uDet: { value: null }, uSnowY: { value: 6 }, uDetK: { value: 1 },
  uRockA: { value: new THREE.Color('#5e544b') }, uRockB: { value: new THREE.Color('#a39482') }, uSnowC: { value: new THREE.Color('#f3f6fa') },
};
export const TERRAIN_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0, envMapIntensity: 0.6, map: new THREE.DataTexture(new Uint8Array([200, 200, 200, 0]), 1, 1) });
TERRAIN_MAT.map.needsUpdate = true;
TERRAIN_MAT.onBeforeCompile = (sh) => {
  Object.assign(sh.uniforms, TERR_U);
  sh.vertexShader = 'attribute vec3 aOwn;\nattribute vec4 aOwnK;\nvarying vec3 vOwn;\nvarying vec4 vOwnK;\nvarying vec3 vWP;\nvarying vec3 vWN;\n' +
    sh.vertexShader
      .replace('#include <color_vertex>', '#include <color_vertex>\nvOwn = aOwn; vOwnK = aOwnK;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWN = normalize(mat3(modelMatrix) * objectNormal);');
  sh.fragmentShader = [
    'uniform float uTint;', 'uniform float uEdge;', 'uniform float uNeu;', 'uniform float uLum;',
    'uniform sampler2D uDet;', 'uniform float uSnowY;', 'uniform float uDetK;', 'uniform vec3 uRockA;', 'uniform vec3 uRockB;', 'uniform vec3 uSnowC;',
    'varying vec3 vOwn;', 'varying vec4 vOwnK;', 'varying vec3 vWP;', 'varying vec3 vWN;', '',
  ].join('\n') + sh.fragmentShader
    .replace('#include <map_fragment>', [
      '#include <map_fragment>',
      '{',
      '  float sandy = sampledDiffuseColor.a; diffuseColor.a = 1.0;',
      '  vec4 dA = texture2D(uDet, vWP.xz * 0.075);',
      '  vec4 dF = texture2D(uDet, vWP.xz * 0.21 + vec2(0.5, 0.25));',
      '  vec4 dB = texture2D(uDet, vWP.xz * 0.024 + vec2(0.37, 0.71));',
      '  float st = dA.r - 0.5, gr = dF.r - 0.5;',
      '  float det = mix(st + gr * 0.55, (dA.g - 0.5) * 0.8 + (dF.g - 0.5) * 0.35, sandy) * uDetK;',
      '  vec3 cc = diffuseColor.rgb * (1.0 + det * 0.95);',
      '  cc += vec3(0.035, 0.022, -0.03) * (st + gr * 0.5) * (1.0 - sandy);',
      '  diffuseColor.rgb = max(cc, vec3(0.0)) * (0.84 + 0.32 * dB.a);',
      '  float land = smoothstep(-0.05, 0.2, vWP.y);',
      '  float steep = 1.0 - clamp(vWN.y, 0.0, 1.0);',
      '  float rk = smoothstep(0.3, 0.46, steep + (dB.a - 0.5) * 0.2) * land;',
      '  float strata = texture2D(uDet, vec2((vWP.x + vWP.z) * 0.06, vWP.y * 0.16)).b;',
      '  vec3 rock = mix(uRockA, uRockB, strata) * (0.82 + 0.36 * dF.r);',
      '  diffuseColor.rgb = mix(diffuseColor.rgb, rock, rk);',
      '  float sn = smoothstep(uSnowY - 0.25, uSnowY + 0.25, vWP.y + (dB.a - 0.5) * 2.0 + st * 0.8) * (1.0 - smoothstep(0.42, 0.6, steep));',
      '  diffuseColor.rgb = mix(diffuseColor.rgb, uSnowC * (0.9 + 0.16 * dA.r), sn);',
      '}',
    ].join('\n'))
    .replace('#include <encodings_fragment>', [
      '#include <encodings_fragment>',
      '{',
      '  const vec3 LW = vec3(0.299, 0.587, 0.114);',
      '  vec3 o = gl_FragColor.rgb;',
      '  float L = dot(o, LW);',
      // disputed provinces: each holder's zone in its colour, crossed by soft diagonal bands of plain ground
      '  float hatch = vOwnK.w * smoothstep(0.25, 0.75, 0.5 + 0.5 * sin((vWP.x + vWP.z) * 2.2));',
      '  o = mix(o, vec3(L), vOwnK.z * uNeu * (1.0 - 0.7 * hatch));',
      '  float lc = dot(vOwn, LW);',
      '  float Lt = mix(L, lc, uLum);',
      '  vec3 cb = vOwn + (Lt - lc);',
      '  float n = min(min(cb.r, cb.g), cb.b), x = max(max(cb.r, cb.g), cb.b);',
      '  if (n < 0.0) cb = Lt + (cb - Lt) * Lt / max(Lt - n, 1e-4);',
      '  if (x > 1.0) cb = Lt + (cb - Lt) * (1.0 - Lt) / max(x - Lt, 1e-4);',
      '  float k = clamp(vOwnK.x * uTint + vOwnK.y * uEdge, 0.0, 0.95) * (1.0 - 0.7 * hatch);',
      '  gl_FragColor.rgb = mix(o, cb, k);',
      '}',
    ].join('\n'));
};
TERRAIN_MAT.customProgramCacheKey = () => 'terrain-paint2';
export const VIEW = { political: false };
export function updateTerritoryLook() {
  const s = smooth(28, 138, CAM.d);
  TERR_U.uDetK.value = lerp(1, 0.3, smooth(40, 140, CAM.d));
  if (VIEW.political) { TERR_U.uTint.value = 0.82; TERR_U.uEdge.value = 0.15; TERR_U.uNeu.value = 0.8; TERR_U.uLum.value = 0.45; BORDER_U.uBW.value = lerp(1.1, 2.0, s); }
  else {
    TERR_U.uTint.value = lerp(0.14, 0.55, s);
    TERR_U.uEdge.value = lerp(0.34, 0.4, s);
    TERR_U.uNeu.value = lerp(0.0, 0.35, s);
    TERR_U.uLum.value = lerp(0.18, 0.32, s);
    BORDER_U.uBW.value = lerp(1, 2.1, s);
  }
}
export const hexRGB = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];

/* ---------- mesh ---------- */
export let baseShade = null;
export function buildTerrain() {
  if (!DETAIL_TEX) buildDetailTexture();
  TERR_U.uDet.value = DETAIL_TEX;
  buildHeights();
  paintAlbedo();
  TERRAIN_MAT.map = albedoTex;
  TERR_U.uSnowY.value = elevToHeight(MAP.eSnow) + 0.9;
  const NV = FW * FH;
  const pos = new Float32Array(NV * 3), uv = new Float32Array(NV * 2);
  for (let j = 0; j < FH; j++) for (let i = 0; i < FW; i++) {
    const v = j * FW + i;
    pos[v * 3] = i / RS - (MAP.W - 1) / 2; pos[v * 3 + 1] = HF[v]; pos[v * 3 + 2] = j / RS - (MAP.H - 1) / 2;
    uv[v * 2] = i / (FW - 1); uv[v * 2 + 1] = j / (FH - 1);
  }
  const idx = new Uint32Array((FW - 1) * (FH - 1) * 6);
  let k = 0;
  for (let j = 0; j < FH - 1; j++) for (let i = 0; i < FW - 1; i++) {
    const a = j * FW + i, b = a + 1, c = a + FW, d = c + 1;
    idx[k++] = a; idx[k++] = c; idx[k++] = b; idx[k++] = b; idx[k++] = c; idx[k++] = d;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  terrainColors = new Float32Array(NV * 3);
  ownCol = new Float32Array(NV * 3); ownK = new Float32Array(NV * 4);   // ownK: owned tint, border glow, free land, disputed
  g.setAttribute('color', new THREE.BufferAttribute(terrainColors, 3));
  g.setAttribute('aOwn', new THREE.BufferAttribute(ownCol, 3));
  g.setAttribute('aOwnK', new THREE.BufferAttribute(ownK, 4));
  g.computeBoundingSphere();
  // valleys a little darker, crests a little lighter (cheap ambient occlusion)
  const blur = (src, r) => {
    const a = new Float32Array(NV), b = new Float32Array(NV);
    for (let j = 0; j < FH; j++) { let s = 0, n = 0; for (let i = -r; i < FW + r; i++) { if (i + r < FW) { s += src[j * FW + i + r]; n++; } if (i - r - 1 >= 0) { s -= src[j * FW + i - r - 1]; n--; } if (i >= 0 && i < FW) a[j * FW + i] = s / n; } }
    for (let i = 0; i < FW; i++) { let s = 0, n = 0; for (let j = -r; j < FH + r; j++) { if (j + r < FH) { s += a[(j + r) * FW + i]; n++; } if (j - r - 1 >= 0) { s -= a[(j - r - 1) * FW + i]; n--; } if (j >= 0 && j < FH) b[j * FW + i] = s / n; } }
    return b;
  };
  const hb = blur(HF, 4);
  baseShade = new Float32Array(NV);
  for (let v = 0; v < NV; v++) baseShade[v] = HF[v] > 0 ? clamp(1 - (hb[v] - HF[v]) * 0.32, 0.68, 1.1) : 1;
  fineProv = new Int16Array(NV);
  for (let j = 0; j < FH; j++) for (let i = 0; i < FW; i++) fineProv[j * FW + i] = MAP.prov[Math.round(j / RS) * MAP.W + Math.round(i / RS)];
  terrain = new THREE.Mesh(g, TERRAIN_MAT);
  terrain.receiveShadow = true; terrain.castShadow = true;
  worldGroup.add(terrain);
  updateTerrainColors();
  buildSeaTexture();
}

export function provOwner(p) { return MAP.provinces[p].owner; }
export let terrain;
export let ownSig = '';
export function resetOwnership() { ownSig = ''; }
export function updateTerrainColors() {
  const NV = FW * FH;
  const selP = UI && UI.selProv != null ? UI.selProv : -1;
  for (let v = 0; v < NV; v++) {
    let s = baseShade[v];
    if (selP >= 0 && fineProv[v] === selP) s = s * 1.2 + 0.04;
    terrainColors[v * 3] = terrainColors[v * 3 + 1] = terrainColors[v * 3 + 2] = s;
  }
  terrain.geometry.attributes.color.needsUpdate = true;
  const sig = MAP.provinces.map((P) => (P.owner === DISPUTED ? 'd' + P.sig : P.owner)).join('|');
  if (sig !== ownSig) { ownSig = sig; updateOwnership(); }
  refreshBorders(sig);
}
// owner colour + inner glow along foreign borders (distance field on the fine grid)
export let OWN_SRGB = null;
export function updateOwnership() {
  if (!OWN_SRGB) OWN_SRGB = FACTIONS.map((F) => hexRGB(F.css));
  const NV = FW * FH;
  const own = new Int8Array(NV).fill(-2), disp = new Uint8Array(NV);
  const zones = MAP.provinces.map((P) => (P.owner === DISPUTED ? placesOf(P).map((x) => [x.ref.x * RS, x.ref.y * RS, x.ref.owner]) : null));
  for (let v = 0; v < NV; v++) {
    const p = fineProv[v];
    if (p < 0 || HF[v] <= -0.02) continue;
    const Z = zones[p];
    if (!Z) { own[v] = provOwner(p); continue; }
    const i = v % FW, j = (v / FW) | 0;
    let bd = Infinity;
    for (const [x, y, o] of Z) { const d = (x - i) * (x - i) + (y - j) * (y - j); if (d < bd) { bd = d; own[v] = o; } }
    disp[v] = 1;
  }
  const dist = new Float32Array(NV).fill(99);
  const q = [];
  for (let v = 0; v < NV; v++) {
    const o = own[v]; if (o < 0) continue;
    const i = v % FW, j = (v / FW) | 0;
    let edge = false;
    for (let k = 0; k < 8 && !edge; k++) {
      const ni = i + N8[k][0], nj = j + N8[k][1];
      if (ni < 0 || nj < 0 || ni >= FW || nj >= FH) continue;
      const on = own[nj * FW + ni];
      if (on !== -2 && on !== o) edge = true;
    }
    if (edge) { dist[v] = 0; q.push(v); }
  }
  const maxD = 3.6 * RS;
  for (let h = 0; h < q.length; h++) {
    const v = q[h], d0 = dist[v]; if (d0 >= maxD) continue;
    const i = v % FW, j = (v / FW) | 0, o = own[v];
    for (let k = 0; k < 8; k++) {
      const ni = i + N8[k][0], nj = j + N8[k][1];
      if (ni < 0 || nj < 0 || ni >= FW || nj >= FH) continue;
      const u = nj * FW + ni;
      if (own[u] !== o) continue;
      const nd = d0 + (N8[k][0] && N8[k][1] ? 1.414 : 1);
      if (nd < dist[u]) { dist[u] = nd; q.push(u); }
    }
  }
  for (let v = 0; v < NV; v++) {
    const o = own[v];
    if (o >= 0) {
      const fc = OWN_SRGB[o];
      ownCol[v * 3] = fc[0]; ownCol[v * 3 + 1] = fc[1]; ownCol[v * 3 + 2] = fc[2];
      const e = Math.max(0, 1 - dist[v] / RS / 3.2);
      ownK[v * 4] = 1; ownK[v * 4 + 1] = e * e; ownK[v * 4 + 2] = 0; ownK[v * 4 + 3] = disp[v];
    } else {
      ownCol[v * 3] = ownCol[v * 3 + 1] = ownCol[v * 3 + 2] = 0;
      ownK[v * 4] = 0; ownK[v * 4 + 1] = 0; ownK[v * 4 + 2] = o === -1 ? 1 : 0; ownK[v * 4 + 3] = disp[v];
    }
  }
  terrain.geometry.attributes.aOwn.needsUpdate = true;
  terrain.geometry.attributes.aOwnK.needsUpdate = true;
}
