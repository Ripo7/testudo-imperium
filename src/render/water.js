import { THREE } from '../three.js';
import { MAP } from '../game/state.js';
import { clamp } from '../core/util.js';
import { N8, rng32 } from '../map/generate.js';
import { riverMeshes, worldGroup } from './world.js';
import { DETAIL_TEX, FH, FW, heightAt, HF, RS } from './terrain.js';

/* =========================================================
   Water: painted sea with depth bands, lapping shore foam,
   sun glints; flowing rivers with soft banks.
   ========================================================= */
export const SUN_DIR = new THREE.Vector3(-60, 120, 40).normalize();
export const WATER_U = Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), {
  uTime: { value: 0 },
  uSea: { value: null },
  uDet: { value: null },
  uMap: { value: new THREE.Vector4(0, 0, 1, 1) },     // xz offset, 1/size
  uSunDir: { value: SUN_DIR },
  uSunCol: { value: new THREE.Color('#fff1d6') },
  cShallow: { value: new THREE.Color('#58cbbf') },
  cMid: { value: new THREE.Color('#2a93b3') },
  cDeep: { value: new THREE.Color('#2366a0') },
  cAbyss: { value: new THREE.Color('#1d5890') },
  cFoam: { value: new THREE.Color('#f6fbfb') },
  cSky: { value: new THREE.Color('#cfe3f0') },
});
export const WATER_MAT = new THREE.ShaderMaterial({
  uniforms: WATER_U, fog: true, transparent: true, depthWrite: true,
  vertexShader: [
    'varying vec3 vWP;',
    '#include <fog_pars_vertex>',
    'void main() {',
    '  vec4 wp = modelMatrix * vec4(position, 1.0);',
    '  vWP = wp.xyz;',
    '  vec4 mvPosition = viewMatrix * wp;',
    '  gl_Position = projectionMatrix * mvPosition;',
    '  #include <fog_vertex>',
    '}',
  ].join('\n'),
  fragmentShader: [
    'uniform float uTime;', 'uniform sampler2D uSea;', 'uniform sampler2D uDet;', 'uniform vec4 uMap;',
    'uniform vec3 uSunDir;', 'uniform vec3 uSunCol;',
    'uniform vec3 cShallow;', 'uniform vec3 cMid;', 'uniform vec3 cDeep;', 'uniform vec3 cAbyss;', 'uniform vec3 cFoam;', 'uniform vec3 cSky;',
    'varying vec3 vWP;',
    '#include <common>',
    '#include <fog_pars_fragment>',
    'void main() {',
    '  vec2 m = (vWP.xz + uMap.xy) * uMap.zw;',
    '  float inMap = step(0.0, m.x) * step(m.x, 1.0) * step(0.0, m.y) * step(m.y, 1.0);',
    '  vec4 sea = texture2D(uSea, clamp(m, 0.0, 1.0));',
    '  float depth = mix(1.0, sea.r, inMap);',
    '  float sd = mix(8.0, sea.g * 8.0, inMap);',          // distance to the shore, in cells
    '  vec2 p = vWP.xz;',
    '  float t = uTime;',
    '  float nB = texture2D(uDet, p * 0.021 + vec2(t * 0.003, t * 0.0017)).a;',
    '  float s1 = texture2D(uDet, p * 0.09 + vec2(t * 0.011, -t * 0.006)).r;',
    '  float s2 = texture2D(uDet, p.yx * 0.075 + vec2(-t * 0.008, t * 0.012)).r;',
    // stylised depth bands: turquoise shelf, blue sea, deep ocean
    '  float d = clamp(depth + (nB - 0.5) * 0.1, 0.0, 1.0);',
    '  vec3 col = mix(cShallow, cMid, smoothstep(0.1, 0.2, d));',
    '  col = mix(col, cDeep, smoothstep(0.34, 0.5, d));',
    '  col = mix(col, cAbyss, smoothstep(0.75, 1.0, d) * (0.6 + 0.4 * nB));',
    '  float lake = sea.b * inMap;',
    '  col = mix(col, mix(cMid, cShallow, 0.3 + 0.2 * nB), lake);',
    // painted wave strokes
    '  float st = (s1 - 0.5) + (s2 - 0.5);',
    '  col *= 1.0 + st * 0.32;',
    '  col += vec3(0.02, 0.035, 0.04) * smoothstep(0.08, 0.25, st);',
    // foam: a lapping line on the beach + wave bands rolling in
    '  float wob = sin(t * 1.4 + p.x * 0.9 + p.y * 0.6) * 0.06 + (nB - 0.5) * 0.25;',
    '  float lap = 1.0 - smoothstep(0.34, 0.5, sd + wob);',
    '  float lap2 = smoothstep(0.62, 0.7, sd + wob * 1.5) * (1.0 - smoothstep(0.74, 0.86, sd + wob * 1.5));',
    '  float ph = sd * 5.0 - t * 1.25 + nB * 5.0;',
    '  float band = smoothstep(0.55, 0.92, sin(ph)) * (1.0 - smoothstep(0.5, 2.0, sd));',
    '  float breakup = smoothstep(0.38, 0.62, s1 * 0.6 + s2 * 0.6 - 0.1);',
    '  float foam = clamp(lap * (0.75 + 0.25 * breakup) + lap2 * 0.55 * (0.4 + 0.6 * breakup) + band * breakup * 0.7, 0.0, 1.0) * inMap;',
    '  col = mix(col, cFoam, foam);',
    // light: sky in grazing angles, glints of sun
    '  vec3 V = normalize(cameraPosition - vWP);',
    '  vec3 N = normalize(vec3((s1 - 0.5) * 0.5, 1.0, (s2 - 0.5) * 0.5));',
    '  float fres = pow(1.0 - max(dot(N, V), 0.0), 5.0);',
    '  col = mix(col, cSky, fres * 0.55);',
    '  vec3 H = normalize(uSunDir + V);',
    '  float spec = pow(max(dot(N, H), 0.0), 220.0);',
    '  col += uSunCol * spec * 1.4 * (1.0 - foam);',
    '  float alpha = mix(0.42, 0.97, smoothstep(0.25, 1.4, sd));',
    '  alpha = mix(alpha, mix(0.5, 0.93, smoothstep(0.25, 0.7, sd)), lake);',
    '  alpha = max(alpha, foam * 0.95);',
    '  gl_FragColor = vec4(col, alpha);',
    '  #include <tonemapping_fragment>',
    '  #include <encodings_fragment>',
    '  #include <fog_fragment>',
    '}',
  ].join('\n'),
});

/* depth + distance-to-shore field over the map, from the fine terrain grid */
export let seaTex = null;
export function buildSeaTexture() {
  const NV = FW * FH;
  const dist = new Float32Array(NV).fill(1e9);
  const q = [];
  for (let v = 0; v < NV; v++) if (HF[v] > 0) { dist[v] = 0; q.push(v); }
  // chamfer BFS (in fine steps), limited to 8 cells
  const lim = 8 * RS;
  for (let h = 0; h < q.length; h++) {
    const v = q[h], d0 = dist[v]; if (d0 >= lim) continue;
    const i = v % FW, j = (v / FW) | 0;
    for (let k = 0; k < 8; k++) {
      const ni = i + N8[k][0], nj = j + N8[k][1];
      if (ni < 0 || nj < 0 || ni >= FW || nj >= FH) continue;
      const u = nj * FW + ni;
      const nd = d0 + (N8[k][0] && N8[k][1] ? 1.414 : 1);
      if (nd < dist[u]) { dist[u] = nd; q.push(u); }
    }
  }
  const data = new Uint8Array(NV * 4);
  for (let v = 0; v < NV; v++) {
    const depth = HF[v] > 0 ? 0 : clamp(-HF[v] / 3.2, 0, 1);
    const sd = Math.min(dist[v], lim) / RS / 8;
    const i = v % FW, j = (v / FW) | 0, cell = Math.round(j / RS) * MAP.W + Math.round(i / RS);
    const lake = HF[v] <= 0 && !MAP.ocean[cell] ? 255 : 0;
    data[v * 4] = depth * 255; data[v * 4 + 1] = clamp(sd, 0, 1) * 255; data[v * 4 + 2] = lake; data[v * 4 + 3] = 255;
  }
  if (seaTex) seaTex.dispose();
  seaTex = new THREE.DataTexture(data, FW, FH, THREE.RGBAFormat);
  seaTex.magFilter = THREE.LinearFilter; seaTex.minFilter = THREE.LinearFilter;
  seaTex.wrapS = seaTex.wrapT = THREE.ClampToEdgeWrapping;
  seaTex.needsUpdate = true;
  WATER_U.uSea.value = seaTex;
  WATER_U.uDet.value = DETAIL_TEX;
  // texel centres sit on the fine vertices
  const sx = (MAP.W - 1) * (FW / (FW - 1)), sz = (MAP.H - 1) * (FH / (FH - 1));
  WATER_U.uMap.value.set(sx / 2, sz / 2, 1 / sx, 1 / sz);
  RIVER_U.uDet.value = DETAIL_TEX;
}

/* ---------- rivers ---------- */
export const RIVER_U = Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), {
  uTime: { value: 0 }, uDet: { value: null },
  cBed: { value: new THREE.Color('#2f8fb4') }, cEdge: { value: new THREE.Color('#6fd0c8') }, cFoam: { value: new THREE.Color('#f0fbfa') }, cBank: { value: new THREE.Color('#6f8746') },
});
export const RIVER_MAT = new THREE.ShaderMaterial({
  uniforms: RIVER_U, fog: true, transparent: true, depthWrite: false,
  polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  vertexShader: [
    'attribute vec2 aRiv;', 'varying vec2 vRiv;', 'varying vec3 vWP;',
    '#include <fog_pars_vertex>',
    'void main() {',
    '  vRiv = aRiv;',
    '  vec4 wp = modelMatrix * vec4(position, 1.0); vWP = wp.xyz;',
    '  vec4 mvPosition = viewMatrix * wp;',
    '  gl_Position = projectionMatrix * mvPosition;',
    '  #include <fog_vertex>',
    '}',
  ].join('\n'),
  fragmentShader: [
    'uniform float uTime;', 'uniform sampler2D uDet;', 'uniform vec3 cBed;', 'uniform vec3 cEdge;', 'uniform vec3 cFoam;', 'uniform vec3 cBank;',
    'varying vec2 vRiv;', 'varying vec3 vWP;',
    '#include <common>',
    '#include <fog_pars_fragment>',
    'void main() {',
    '  float e = abs(vRiv.y - 0.5) * 2.0;',           // 0 mid-stream, 1 at the bank
    '  float flow = texture2D(uDet, vec2(vRiv.x * 0.22 - uTime * 0.16, vRiv.y * 0.35)).r;',
    '  float flow2 = texture2D(uDet, vec2(vRiv.x * 0.5 - uTime * 0.3, vRiv.y * 0.6 + 0.3)).r;',
    '  vec3 col = mix(cBed, cEdge, smoothstep(0.15, 0.8, e));',
    '  col *= 0.9 + (flow - 0.5) * 0.5 + (flow2 - 0.5) * 0.3;',
    '  col = mix(col, cFoam, smoothstep(0.62, 0.75, flow2) * (1.0 - e) * 0.45);',
    '  float water = 1.0 - smoothstep(0.7, 0.84, e);',
    '  col = mix(cBank, col, water);',                    // wet bank rim
    '  float alpha = mix(0.35, 0.92, water) * (1.0 - smoothstep(0.86, 1.0, e));',
    '  gl_FragColor = vec4(col, alpha);',
    '  #include <tonemapping_fragment>',
    '  #include <encodings_fragment>',
    '  #include <fog_fragment>',
    '}',
  ].join('\n'),
});
// every river's course as drawn: smoothed, meandering, widening toward the sea;
// [[x, y, half width, dx, dy (its direction), s (length so far)], ...] in cells
export let riverCache = null;
export function riverLines() {
  if (riverCache && riverCache.map === MAP) return riverCache.lines;
  const rnd = rng32(MAP.seed + 77), lines = [];
  for (const rv of MAP.rivers) {
    let pts = rv.map((c) => [c % MAP.W, (c / MAP.W) | 0]);
    // gentle meanders (stay inside the carved bed)
    const ph = rnd() * 10, fq = 0.55 + rnd() * 0.4;
    for (let it = 0; it < 4; it++) {           // chaikin smoothing
      const np = [pts[0]];
      for (let k = 0; k < pts.length - 1; k++) {
        const [ax, ay] = pts[k], [bx, by] = pts[k + 1];
        np.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25], [ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75]);
      }
      np.push(pts[pts.length - 1]); pts = np;
    }
    const n = pts.length, line = [];
    let s = 0;
    for (let k = 0; k < n; k++) {
      const [px, py] = pts[Math.max(0, k - 1)], [qx, qy] = pts[Math.min(n - 1, k + 1)];
      let dx = qx - px, dy = qy - py; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      if (k > 0) s += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
      const mea = Math.sin(s * fq + ph) * 0.16 * Math.min(1, k / 6, (n - 1 - k) / 6);
      line.push([pts[k][0] - dy * mea, pts[k][1] + dx * mea, 0.17 + 0.33 * k / (n - 1), dx, dy, s]);
    }
    lines.push(line);
  }
  riverCache = { map: MAP, lines };
  return lines;
}
export function buildRivers() {
  for (const line of riverLines()) {
    const n = line.length, verts = [], uvs = [], idx = [];
    for (let k = 0; k < n; k++) {
      const [x, y, w, dx, dy, s] = line[k];
      const wx = x - (MAP.W - 1) / 2, wz = y - (MAP.H - 1) / 2;
      const hl = Math.max(heightAt(x - dy * w, y + dx * w), heightAt(x, y)), hr = Math.max(heightAt(x + dy * w, y - dx * w), heightAt(x, y));
      verts.push(wx - dy * w, Math.max(hl, 0.02) + 0.05, wz + dx * w, wx + dy * w, Math.max(hr, 0.02) + 0.05, wz - dx * w);
      uvs.push(s, 0, s, 1);
      if (k > 0) { const a = (k - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute('aRiv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, RIVER_MAT); m.renderOrder = 1;
    worldGroup.add(m); riverMeshes.push(m);
  }
}
export function updateWater() {
  const t = performance.now() / 1000;
  WATER_U.uTime.value = t; RIVER_U.uTime.value = t;
}
