import { THREE } from '../three.js';
import { MAP } from '../game/state.js';
import { clamp, isTouch, lerp, smooth, TAU } from '../core/util.js';
import { BIOME, makePerlin, N4, N8, rng32 } from '../map/generate.js';
import { camera, cone, cyl, merge, sph } from './renderer.js';
import { elevToHeight, worldGroup } from './world.js';
import { CAM } from './camera.js';
import { heightAt } from './terrain.js';
import { masked } from './cities.js';

/* =========================================================
   Vegetation & rocks: chunky painted trees by biome, swaying in the wind,
   instanced per map tile (culled by hand) with distance-based detail.
   ========================================================= */
export const FLORA_U = { uTime: { value: 0 } };
export function floraMaterial(flat) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0, flatShading: !!flat, envMapIntensity: 0.7 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = FLORA_U.uTime;
    sh.vertexShader = 'attribute float aTint;\nattribute float aSway;\nuniform float uTime;\n' + sh.vertexShader
      .replace('#include <color_vertex>', [
        'vColor = vec3(1.0);',
        '#ifdef USE_COLOR', 'vColor *= color;', '#endif',
        '#ifdef USE_INSTANCING_COLOR', 'vColor.xyz = mix(vColor.xyz, vColor.xyz * instanceColor.xyz, aTint);', '#endif',
      ].join('\n'))
      .replace('#include <begin_vertex>', [
        '#include <begin_vertex>',
        '#ifdef USE_INSTANCING',
        '  vec3 ip = instanceMatrix[3].xyz;',
        '  float sw = sin(uTime * 1.5 + ip.x * 0.55 + ip.z * 0.4) + 0.45 * sin(uTime * 2.6 + ip.x * 1.3 - ip.z * 0.7);',
        '  transformed.x += sw * 0.03 * aSway; transformed.z += sw * 0.018 * aSway;',
        '#endif',
      ].join('\n'));
  };
  m.customProgramCacheKey = () => 'flora-' + (flat ? 'f' : 's');
  return m;
}
export const FLORA_MAT = { soft: floraMaterial(false), flat: floraMaterial(true) };

/* ---------- geometry helpers ---------- */
export function lumpy(g, amt, seed) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const h = Math.sin(Math.round(x * 1000) * 0.012989 + Math.round(y * 1000) * 0.078233 + Math.round(z * 1000) * 0.037719 + seed) * 43758.5453;
    const k = 1 + (h - Math.floor(h) - 0.5) * amt;
    p.setXYZ(i, x * k, y * k, z * k);
  }
  g.computeVertexNormals();
  return g;
}
export function doubleFaced(points, tris) {   // tris: [a,b,c] indices into points; emits both windings
  const pos = [];
  for (const [a, b, c] of tris) {
    pos.push(...points[a], ...points[b], ...points[c]);
    pos.push(...points[a], ...points[c], ...points[b]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
// darker at the bottom, sunlit on top (only on the tinted foliage), plus the wind weight
export function finishFlora(g, y0, y1, lo, hi, sway) {
  const p = g.attributes.position, c = g.attributes.color, t = g.attributes.aTint;
  const sw = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (t.getX(i) > 0.5) { const f = lerp(lo, hi, smooth(y0, y1, y)); c.setXYZ(i, c.getX(i) * f, c.getY(i) * f, c.getZ(i) * f); }
    sw[i] = sway ? Math.max(0, y - 0.12) : 0;
  }
  g.setAttribute('aSway', new THREE.BufferAttribute(sw, 1));
  g.userData.shared = true;
  return g;
}
export let FLORA_GEO = null;
export function buildFloraGeos() {
  const W = '#ffffff', BARK = '#6b4a2e', BARK2 = '#8a6a45';
  const G = {};
  G.oak = finishFlora(merge([
    { geo: cyl(0.035, 0.055, 0.32, 5, true), color: BARK, pos: [0, 0.16, 0] },
    { geo: lumpy(sph(0.29, 6, 4), 0.22, 1), color: W, pos: [0, 0.52, 0], scale: [1, 0.86, 1], tint: 1 },
    { geo: lumpy(sph(0.2, 5, 4), 0.25, 2), color: W, pos: [0.16, 0.42, 0.07], tint: 1 },
    { geo: lumpy(sph(0.18, 5, 3), 0.25, 3), color: W, pos: [-0.12, 0.66, -0.06], tint: 1 },
  ], true), 0.25, 0.85, 0.58, 1.15, true);
  G.pine = finishFlora(merge([
    { geo: cyl(0.03, 0.045, 0.24, 5, true), color: BARK, pos: [0, 0.12, 0] },
    { geo: cone(0.27, 0.42, 7), color: W, pos: [0, 0.4, 0], tint: 1 },
    { geo: cone(0.21, 0.36, 7), color: W, pos: [0, 0.61, 0], rot: [0, 0.4, 0], tint: 1 },
    { geo: cone(0.13, 0.3, 6), color: W, pos: [0, 0.81, 0], rot: [0, 0.9, 0], tint: 1 },
  ], true), 0.2, 0.96, 0.6, 1.12, true);
  G.cypress = finishFlora(merge([
    { geo: cyl(0.025, 0.035, 0.14, 5, true), color: BARK, pos: [0, 0.07, 0] },
    { geo: lumpy(sph(0.12, 6, 6), 0.16, 4), color: W, pos: [0, 0.5, 0], scale: [1, 3.1, 1], tint: 1 },
  ], true), 0.15, 0.85, 0.6, 1.1, true);
  {
    const parts = [];
    let px = 0, py = 0;
    for (let k = 0; k < 4; k++) {          // a gently curved trunk
      const t0 = k / 4, t1 = (k + 1) / 4;
      const x0 = 0.1 * t0 * t0, x1 = 0.1 * t1 * t1, y0 = t0 * 0.78, y1 = t1 * 0.78;
      const len = Math.hypot(x1 - x0, y1 - y0);
      parts.push({ geo: cyl(0.03 - k * 0.003, 0.036 - k * 0.003, len, 5, true), color: k % 2 ? BARK2 : '#7a5a3a', pos: [(x0 + x1) / 2, (y0 + y1) / 2, 0], rot: [0, 0, -Math.atan2(x1 - x0, y1 - y0)] });
      px = x1; py = y1;
    }
    for (let k = 0; k < 7; k++) {          // drooping fronds
      const L = 0.3 + (k % 3) * 0.04, dr = 0.12 + (k % 2) * 0.05, w = 0.06;
      const fr = doubleFaced([[0, 0, 0], [L * 0.45, 0.07, -w], [L * 0.45, 0.07, w], [L, -dr, 0]], [[0, 2, 1], [1, 2, 3]]);
      parts.push({ geo: fr, color: W, pos: [px, py, 0], rot: [0, k * (TAU / 7) + 0.3, 0.1], tint: 1 });
    }
    parts.push({ geo: sph(0.035, 5, 3), color: '#6b5a2e', pos: [px + 0.02, py - 0.03, 0.02] });
    G.palm = finishFlora(merge(parts, true), 0.6, 0.85, 0.7, 1.12, true);
  }
  G.bush = finishFlora(merge([
    { geo: lumpy(sph(0.16, 6, 4), 0.25, 5), color: W, pos: [0, 0.09, 0], scale: [1, 0.72, 1], tint: 1 },
    { geo: lumpy(sph(0.11, 5, 3), 0.25, 6), color: W, pos: [0.13, 0.06, 0.05], scale: [1, 0.8, 1], tint: 1 },
  ], true), 0.0, 0.2, 0.6, 1.12, true);
  {
    const pts = [], tris = [];
    for (let k = 0; k < 8; k++) {
      const a = k * 2.4, r = 0.03 + (k % 3) * 0.03, ox = Math.cos(a) * r, oz = Math.sin(a) * r;
      const h = 0.28 + ((k * 7) % 5) * 0.06, lean = 0.06 + (k % 2) * 0.05;
      const b = pts.length;
      pts.push([ox - 0.012 * Math.sin(a), 0, oz + 0.012 * Math.cos(a)], [ox + 0.012 * Math.sin(a), 0, oz - 0.012 * Math.cos(a)], [ox + Math.cos(a) * lean, h, oz + Math.sin(a) * lean]);
      tris.push([b, b + 1, b + 2]);
    }
    G.reeds = finishFlora(merge([{ geo: doubleFaced(pts, tris), color: W, tint: 1 }], true), 0, 0.3, 0.55, 1.15, true);
  }
  G.rock = finishFlora(merge([
    { geo: lumpy(new THREE.IcosahedronGeometry(0.15, 0), 0.4, 7), color: W, pos: [0, 0.04, 0], scale: [1, 0.62, 1.1], tint: 1 },
    { geo: lumpy(new THREE.IcosahedronGeometry(0.09, 0), 0.4, 8), color: W, pos: [0.14, 0.02, 0.06], scale: [1, 0.7, 1], tint: 1 },
  ], true), -0.05, 0.12, 0.72, 1.1, false);
  FLORA_GEO = G;
}
export const FLORA_KIND = {
  oak: { mat: 'soft', small: false, cols: ['#4f8a2e', '#5f9a30', '#447f2a', '#6ea236', '#58902c'] },
  olive: { geo: 'oak', mat: 'soft', small: false, cols: ['#8c9c5c', '#7f9256', '#97a466'] },
  autumn: { geo: 'oak', mat: 'soft', small: false, cols: ['#a9a23a', '#c08a32', '#9aa836'] },
  pine: { mat: 'flat', small: false, cols: ['#2f6037', '#285532', '#3a6b3a', '#2c5a3e'] },
  cypress: { mat: 'soft', small: false, cols: ['#2c5a2c', '#335f2e', '#294f2c'] },
  palm: { mat: 'soft', small: false, cols: ['#5f9a35', '#6fa83c', '#58902f'] },
  bush: { mat: 'soft', small: true, cols: ['#5a8c32', '#6b9838', '#4f8030'] },
  scrub: { geo: 'bush', mat: 'soft', small: true, cols: ['#9a9248', '#8a8a44', '#a39a52'] },
  reeds: { mat: 'flat', small: true, cols: ['#8aa84a', '#a7a858', '#7a9a42'] },
  rock: { mat: 'flat', small: true, cols: ['#8c8278', '#a0968a', '#7d766e', '#968a7c'] },
};

/* ---------- placement ---------- */
export let floraTiles = [];
export const FTX = 3, FTY = 2;
export function buildTrees() {
  if (!FLORA_GEO) buildFloraGeos();
  floraTiles = [];
  const { W, H, biome, river, temp, elev, ocean, seed } = MAP;
  const rnd = rng32(seed + 5), pn = makePerlin(seed + 606);
  const dens = isTouch ? 0.7 : 1;
  const items = {};
  for (const k in FLORA_KIND) items[k] = [];
  const snowH = elevToHeight(MAP.eSnow) + 0.4;
  const cityClear = (x, y) => MAP.cities.some((c) => { const r = c.major ? 1.9 : 1.2; return Math.abs(c.x - x) < r && Math.abs(c.y - y) < r && Math.hypot(c.x - x, c.y - y) < r; });
  const isWaterCell = (x, y) => x < 0 || y < 0 || x >= W || y >= H || elev[y * W + x] < 0;
  const nearLake = (x, y) => { for (const [dx, dy] of N8) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < W && yy < H && elev[yy * W + xx] < 0 && !ocean[yy * W + xx]) return true; } return false; };
  const nearRiver = (x, y) => { if (river[y * W + x]) return true; for (const [dx, dy] of N4) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < W && yy < H && river[yy * W + xx]) return true; } return false; };
  const nearSea = (x, y) => { for (const [dx, dy] of N8) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < W && yy < H && ocean[yy * W + xx]) return true; } return false; };
  const slopeAt = (x, y) => Math.hypot(heightAt(x + 0.25, y) - heightAt(x - 0.25, y), heightAt(x, y + 0.25) - heightAt(x, y - 0.25)) / 0.5;
  const put = (kind, x, y, sc, maxSlope) => {
    if (cityClear(x, y) || masked(x, y)) return;
    const h = heightAt(x, y);
    if (h < 0.05) return;
    if (maxSlope !== undefined && slopeAt(x, y) > maxSlope) return;
    items[kind].push([x, y, h, sc]);
  };
  const forestEdge = (x, y) => { for (const [dx, dy] of N4) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H || biome[yy * W + xx] !== BIOME.FOREST) return true; } return false; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, b = biome[i];
    if (isWaterCell(x, y)) continue;
    const clump = clamp(0.5 + pn(x * 0.13, y * 0.13) * 1.6, 0, 1);
    const R = (p) => rnd() < p * dens;
    const J = () => rnd() - 0.5;
    switch (b) {
      case BIOME.FOREST: {
        const edge = forestEdge(x, y), cool = temp[i] < 0.45 || elev[i] > MAP.eHill * 0.9;
        const pineMix = clamp(0.25 + pn(x * 0.09 + 50, y * 0.09) * 1.4 + (cool ? 0.45 : -0.15), 0, 1);
        for (let sy = 0; sy < 2; sy++) for (let sx = 0; sx < 2; sx++) {
          if (!R(edge ? 0.55 : 0.85)) continue;
          const px = x - 0.25 + sx * 0.5 + J() * 0.42, py = y - 0.25 + sy * 0.5 + J() * 0.42;
          const sc = (0.85 + rnd() * 0.42) * (edge ? 0.8 : 1);
          const kind = rnd() < pineMix ? 'pine' : rnd() < 0.05 ? 'autumn' : 'oak';
          put(kind, px, py, sc, 1.4);
        }
        if (R(0.12)) put('bush', x + J(), y + J(), 0.8 + rnd() * 0.4, 1.4);
        break;
      }
      case BIOME.PLAINS: {
        if (R(0.03 + 0.14 * clump * clump)) put(rnd() < 0.15 ? 'cypress' : 'oak', x + J() * 0.8, y + J() * 0.8, 0.8 + rnd() * 0.35, 1.2);
        if (R(0.02)) put('cypress', x + J() * 0.8, y + J() * 0.8, 0.85 + rnd() * 0.3, 1.2);
        if (R(0.03 + 0.16 * clump * clump)) put('bush', x + J() * 0.9, y + J() * 0.9, 0.75 + rnd() * 0.5, 1.4);
        break;
      }
      case BIOME.STEPPE: {
        if (R(0.12)) put('scrub', x + J() * 0.9, y + J() * 0.9, 0.7 + rnd() * 0.5, 1.4);
        if (R(0.035 + 0.05 * clump)) put('olive', x + J() * 0.8, y + J() * 0.8, 0.7 + rnd() * 0.3, 1.2);
        if (R(0.03)) put('rock', x + J() * 0.9, y + J() * 0.9, 0.7 + rnd() * 0.5);
        break;
      }
      case BIOME.HILLS: {
        if (R(0.14)) put('bush', x + J() * 0.9, y + J() * 0.9, 0.7 + rnd() * 0.5, 1.6);
        if (R(0.16)) put('rock', x + J() * 0.9, y + J() * 0.9, 0.8 + rnd() * 0.7);
        if (R(0.05)) put('cypress', x + J() * 0.8, y + J() * 0.8, 0.8 + rnd() * 0.3, 1.2);
        if (R(0.04 + 0.08 * clump)) put(temp[i] < 0.5 ? 'pine' : 'olive', x + J() * 0.8, y + J() * 0.8, 0.8 + rnd() * 0.3, 1.2);
        break;
      }
      case BIOME.MOUNTAIN: case BIOME.SNOW: {
        for (let k = 0; k < 2; k++) {
          const px = x + J() * 0.9, py = y + J() * 0.9, h = heightAt(px, py);
          if (h < snowH - 1.2 && R(b === BIOME.SNOW ? 0.05 : 0.3)) put('pine', px, py, 0.75 + rnd() * 0.35, 1.3);
        }
        if (R(0.3)) put('rock', x + J() * 0.9, y + J() * 0.9, 0.9 + rnd() * 0.9);
        break;
      }
      case BIOME.DESERT: {
        if (nearRiver(x, y) || nearLake(x, y)) {
          for (let k = 0; k < 2; k++) if (R(0.42)) put('palm', x + J() * 0.95, y + J() * 0.95, 0.85 + rnd() * 0.3, 1.2);
          if (R(0.3)) put('bush', x + J() * 0.9, y + J() * 0.9, 0.7 + rnd() * 0.4, 1.4);
        } else {
          if (R(0.05)) put('scrub', x + J() * 0.9, y + J() * 0.9, 0.6 + rnd() * 0.4, 1.4);
          if (R(0.04)) put('rock', x + J() * 0.9, y + J() * 0.9, 0.7 + rnd() * 0.6);
          if (nearSea(x, y) && R(0.12)) put('palm', x + J() * 0.8, y + J() * 0.8, 0.85 + rnd() * 0.3, 1.2);
        }
        break;
      }
      case BIOME.BEACH: {
        if (temp[i] > 0.6 && R(0.14)) put('palm', x + J() * 0.8, y + J() * 0.8, 0.8 + rnd() * 0.3, 1.2);
        else if (R(0.05)) put('scrub', x + J() * 0.8, y + J() * 0.8, 0.6 + rnd() * 0.3, 1.4);
        break;
      }
    }
    // reeds on river banks and lake shores (not in the deep desert channel itself)
    if (b !== BIOME.SNOW && b !== BIOME.MOUNTAIN && (river[i] || nearLake(x, y))) {
      for (let k = 0; k < 2; k++) {
        if (!R(river[i] ? 0.55 : 0.4)) continue;
        const a = rnd() * TAU, r = river[i] ? 0.34 + rnd() * 0.16 : rnd() * 0.45;
        put('reeds', x + Math.cos(a) * r, y + Math.sin(a) * r, 0.8 + rnd() * 0.5, 1.2);
      }
    }
  }
  // build one instanced mesh per kind and map tile
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
  const tw = W / FTX, th = H / FTY;
  for (const kind in items) {
    const K = FLORA_KIND[kind], geo = FLORA_GEO[K.geo || kind], mat = FLORA_MAT[K.mat];
    const pal = K.cols.map((c) => new THREE.Color(c));
    const buckets = Array.from({ length: FTX * FTY }, () => []);
    for (const it of items[kind]) buckets[Math.min(FTY - 1, Math.floor(it[1] / th)) * FTX + Math.min(FTX - 1, Math.floor(it[0] / tw))].push(it);
    buckets.forEach((list, bi) => {
      if (!list.length) return;
      const mesh = new THREE.InstancedMesh(geo, mat, list.length);
      let hmax = 0;
      list.forEach(([x, y, h, sc], k) => {
        p.set(x - (W - 1) / 2, h - 0.02, y - (H - 1) / 2);
        q.setFromAxisAngle(up, rnd() * TAU);
        if (kind === 'rock') { const e = new THREE.Euler(J2(rnd) * 0.4, rnd() * TAU, J2(rnd) * 0.4); q.setFromEuler(e); }
        s.set(sc, sc * (0.88 + rnd() * 0.25), sc);
        m.compose(p, q, s); mesh.setMatrixAt(k, m);
        col.copy(pal[(rnd() * pal.length) | 0]);
        const v = 0.9 + rnd() * 0.2; col.r *= v; col.g *= v; col.b *= v;
        mesh.setColorAt(k, col);
        hmax = Math.max(hmax, h);
      });
      mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.castShadow = true; mesh.receiveShadow = true;
      const tx = bi % FTX, ty = (bi / FTX) | 0;
      const cx = (tx + 0.5) * tw - (W - 1) / 2, cz = (ty + 0.5) * th - (H - 1) / 2;
      const sphere = new THREE.Sphere(new THREE.Vector3(cx, hmax / 2, cz), Math.hypot(tw, th) / 2 + hmax + 1.5);
      worldGroup.add(mesh);
      floraTiles.push({ mesh, sphere, small: K.small, pts: list.map((it) => [it[0], it[1]]) });
    });
  }
}
export function J2(r) { return r() - 0.5; }
export const _zeroM = new THREE.Matrix4().makeScale(0, 0, 0);
// clear plants under something built later (forts)
export function clearFloraAround(x, y, r) {
  const wx = x - (MAP.W - 1) / 2, wz = y - (MAP.H - 1) / 2;
  for (const t of floraTiles) {
    if (Math.hypot(t.sphere.center.x - wx, t.sphere.center.z - wz) > t.sphere.radius + r) continue;
    let hit = false;
    t.pts.forEach(([px, py], k) => { if (Math.hypot(px - x, py - y) < r) { t.mesh.setMatrixAt(k, _zeroM); hit = true; } });
    if (hit) t.mesh.instanceMatrix.needsUpdate = true;
  }
}
export const _fr = new THREE.Frustum(), _frm = new THREE.Matrix4();
export function updateFlora() {
  FLORA_U.uTime.value = performance.now() / 1000;
  if (!floraTiles.length) return;
  _frm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  _fr.setFromProjectionMatrix(_frm);
  const d = CAM.d;
  for (const t of floraTiles) {
    const vis = (!t.small || d < 112) && _fr.intersectsSphere(t.sphere);
    t.mesh.visible = vis;
    t.mesh.castShadow = t.small ? d < 70 : d < 125;
  }
}
