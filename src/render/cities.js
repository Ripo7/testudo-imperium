import { THREE } from '../three.js';
import { MAP } from '../game/state.js';
import { clamp, lerp, smooth, TAU } from '../core/util.js';
import { BIOME, rng32 } from '../map/generate.js';
import { box, camera, cone, cyl, MAT, merge, sph } from './renderer.js';
import { cellToWorld, FLAG_MAT, worldGroup } from './world.js';
import { CAM } from './camera.js';
import { DETAIL_TEX, FH, FW, heightAt, RS } from './terrain.js';
import { clearFloraAround, FLORA_U } from './vegetation.js';
import { riverLines } from './water.js';
import { cityParts, CULTURE_OF_POWER, planCity, wallParts } from './citygen.js';
import { startingCapitals } from '../game/campaign.js';

/* =========================================================
   Cities, walls, forts, roads, bridges, farmland, ports.
   ========================================================= */
export const PI2 = Math.PI / 2;
// unit roof shapes (base 1x1 centred, height 1 from y=-0.5 to 0.5)
export const HIP_ROOF = cone(0.7071, 1, 4).rotateY(Math.PI / 4); HIP_ROOF.userData.shared = true;
export function gableGeo() {
  const p = [
    [-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0, 0.5, -0.5],     // back gable
    [-0.5, -0.5, 0.5], [0, 0.5, 0.5], [0.5, -0.5, 0.5],        // front gable
  ];
  const tri = (a, b, c) => [...p[a], ...p[b], ...p[c]];
  const pos = [
    ...tri(0, 2, 1), ...tri(3, 5, 4),
    ...tri(0, 3, 4), ...tri(0, 4, 2),     // left slope
    ...tri(1, 2, 4), ...tri(1, 4, 5),     // right slope
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
export const GABLE = gableGeo(); GABLE.userData.shared = true;
export const shadeUp = (g, y0, y1, lo, hi) => {
  const p = g.attributes.position, c = g.attributes.color;
  for (let i = 0; i < p.count; i++) { const f = lerp(lo, hi, smooth(y0, y1, p.getY(i))); c.setXYZ(i, c.getX(i) * f, c.getY(i) * f, c.getZ(i) * f); }
  return g;
};
export const cityR = (c) => (c.major ? 1.6 : 0.95);

/* ---------- occupancy mask (roads, fields, ports): keeps trees off them ---------- */
export let roadMask = null;
export function markMask(x, y, r) {
  for (let j = Math.floor((y - r) * RS); j <= Math.ceil((y + r) * RS); j++) for (let i = Math.floor((x - r) * RS); i <= Math.ceil((x + r) * RS); i++) {
    if (i < 0 || j < 0 || i >= FW || j >= FH) continue;
    if (Math.hypot(i / RS - x, j / RS - y) <= r) roadMask[j * FW + i] = 1;
  }
}
export const masked = (x, y) => { if (!roadMask) return false; const i = Math.round(x * RS), j = Math.round(y * RS); return i >= 0 && j >= 0 && i < FW && j < FH && roadMask[j * FW + i] === 1; };

/* ---------- roads: A* between neighbouring cities, sharing segments ---------- */
export const ROAD_U = { uDet: { value: null } };
export const ROAD_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
ROAD_MAT.onBeforeCompile = (sh) => {
  sh.uniforms.uDet = ROAD_U.uDet;
  sh.vertexShader = 'varying vec3 vRW;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvRW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
  sh.fragmentShader = 'uniform sampler2D uDet;\nvarying vec3 vRW;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n{ vec4 d = texture2D(uDet, vRW.xz * 0.6); diffuseColor.rgb *= 0.82 + 0.36 * d.b; }');
};
ROAD_MAT.customProgramCacheKey = () => 'road1';
export function buildRoads() {
  const { W, H, cities, river } = MAP;
  roadMask = new Uint8Array(FW * FH);
  ROAD_U.uDet.value = DETAIL_TEX;
  for (const c of cities) { c.gates = []; c.theta = rng32(MAP.seed * 13 + c.id)() * Math.PI; }
  // the road network itself is part of the map (map/generate.js): the game uses it for marching
  const polys = MAP.roads.map((R) => ({ a: cities[R.a], b: cities[R.b], pts: R.cells.map((n) => [n % W, (n / W) | 0]), cells: R.cells }));
  const pos = [], col = [], idx = [];
  const bridges = [];
  const edgeC = new THREE.Color('#6a573c'), midC = new THREE.Color('#9e8963');
  for (const R of polys) {
    let pts = R.pts;
    for (let it = 0; it < 3; it++) {
      const np = [pts[0]];
      for (let k = 0; k < pts.length - 1; k++) { const [ax, ay] = pts[k], [bx, by] = pts[k + 1]; np.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25], [ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75]); }
      np.push(pts[pts.length - 1]); pts = np;
    }
    // trim inside the cities and note the gate directions
    const ra = cityR(R.a) - 0.05, rb = cityR(R.b) - 0.05;
    let i0 = 0, i1 = pts.length - 1;
    while (i0 < pts.length - 1 && Math.hypot(pts[i0][0] - R.a.x, pts[i0][1] - R.a.y) < ra) i0++;
    while (i1 > 0 && Math.hypot(pts[i1][0] - R.b.x, pts[i1][1] - R.b.y) < rb) i1--;
    if (i1 - i0 < 2) continue;
    pts = pts.slice(i0, i1 + 1);
    R.a.gates.push(Math.atan2(pts[0][1] - R.a.y, pts[0][0] - R.a.x));
    R.b.gates.push(Math.atan2(pts[pts.length - 1][1] - R.b.y, pts[pts.length - 1][0] - R.b.x));
    const w = 0.11;
    const base = pos.length / 3;
    let inRiver = false;
    for (let k = 0; k < pts.length; k++) {
      const [x, y] = pts[k];
      const [px, py] = pts[Math.max(0, k - 1)], [qx, qy] = pts[Math.min(pts.length - 1, k + 1)];
      let tx = qx - px, ty = qy - py; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
      const nx = -ty, ny = tx;
      for (const [o, c] of [[-1, edgeC], [-0.5, midC], [0.5, midC], [1, edgeC]]) {
        const px2 = x + nx * w * o, py2 = y + ny * w * o;
        const h = Math.max(heightAt(px2, py2), 0.03) + 0.03;
        pos.push(px2 - (W - 1) / 2, h, py2 - (H - 1) / 2);
        col.push(c.r, c.g, c.b);
      }
      if (k > 0) {
        const a0 = base + (k - 1) * 4, a1 = base + k * 4;
        for (let s = 0; s < 3; s++) idx.push(a0 + s, a0 + s + 1, a1 + s, a0 + s + 1, a1 + s + 1, a1 + s);
      }
      markMask(x, y, 0.32);
      const cell = clamp(Math.round(y), 0, H - 1) * W + clamp(Math.round(x), 0, W - 1);
      const wet = !!river[cell] && MAP.elev[cell] >= 0;
      if (wet && !inRiver) bridges.push({ cx: Math.round(x), cy: Math.round(y), tx, ty });
      inRiver = wet;
    }
  }
  if (pos.length) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx); geo.computeVertexNormals();
    // flatten normals up a bit so roads read as flat paving
    const n = geo.attributes.normal;
    for (let i = 0; i < n.count; i++) { const x = n.getX(i) * 0.3, z = n.getZ(i) * 0.3, l = Math.hypot(x, 1, z); n.setXYZ(i, x / l, 1 / l, z / l); }
    n.needsUpdate = true;
    const m = new THREE.Mesh(geo, ROAD_MAT); m.receiveShadow = true; m.renderOrder = 1;
    worldGroup.add(m);
  }
  // stone bridges where roads cross rivers
  const bp = [];
  const seen = new Set();
  for (const b of bridges) {
    const key = b.cx + ',' + b.cy; if (seen.has(key)) continue; seen.add(key);
    const x = b.cx, y = b.cy, ang = Math.atan2(b.ty, b.tx);
    const hb = Math.max(heightAt(x - b.tx * 0.55, y - b.ty * 0.55), heightAt(x + b.tx * 0.55, y + b.ty * 0.55)) + 0.05;
    const wx = x - (W - 1) / 2, wz = y - (H - 1) / 2;
    const ry = -ang;
    const P = (u, v, yy) => [wx + Math.cos(ang) * u - Math.sin(ang) * v, yy, wz + Math.sin(ang) * u + Math.cos(ang) * v];
    bp.push({ geo: box(1.0, 0.05, 0.24), color: '#a8977a', pos: P(0, 0, hb), rot: [0, ry, 0] });
    bp.push({ geo: box(1.0, 0.05, 0.025), color: '#94846a', pos: P(0, 0.115, hb + 0.045), rot: [0, ry, 0] });
    bp.push({ geo: box(1.0, 0.05, 0.025), color: '#94846a', pos: P(0, -0.115, hb + 0.045), rot: [0, ry, 0] });
    for (const u of [-0.22, 0.22]) bp.push({ geo: box(0.08, 0.3, 0.2), color: '#8e806a', pos: P(u, 0, hb - 0.16), rot: [0, ry, 0] });
  }
  if (bp.length) {
    const g = shadeUp(merge(bp), -0.3, 1.5, 0.85, 1.05);
    const m = new THREE.Mesh(g, MAT.vc); m.castShadow = true; m.receiveShadow = true;
    worldGroup.add(m);
  }
  for (const c of cities) {
    // merge gates closer than ~40°
    const gs = [];
    for (const a of c.gates) if (!gs.some((b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) < 0.7)) gs.push(a);
    if (!gs.length) gs.push(rng32(MAP.seed + c.id)() * TAU);
    c.gates = gs.slice(0, c.major ? 4 : 3);
  }
}

/* ---------- farmland: crisp field patchwork around cities ---------- */
export const FIELD_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
FIELD_MAT.onBeforeCompile = (sh) => {
  sh.vertexShader = 'attribute vec3 aF;\nvarying vec3 vF;\n' + sh.vertexShader.replace('#include <color_vertex>', '#include <color_vertex>\nvF = aF;');
  sh.fragmentShader = 'varying vec3 vF;\n' + sh.fragmentShader.replace('#include <color_fragment>', [
    '#include <color_fragment>',
    '{',
    '  float u = vF.x, v = vF.y, ty = vF.z;',
    '  vec3 c = diffuseColor.rgb;',
    '  float s1 = sin(v * 62.0), s2 = sin(u * 54.0);',
    '  float aa1 = clamp(1.0 - fwidth(v * 62.0) * 0.35, 0.0, 1.0), aa2 = clamp(1.0 - fwidth(u * 54.0) * 0.35, 0.0, 1.0);',
    '  if (ty < 0.5) c *= 1.0 + 0.13 * s1 * aa1;',
    '  else if (ty < 1.5) c *= 1.0 + 0.14 * s2 * aa2;',
    '  else if (ty < 2.5) c *= 1.0 + 0.24 * (smoothstep(-0.3, 0.7, s1) - 0.5) * aa1;',
    '  else if (ty < 3.5) { float vine = smoothstep(0.45, 0.85, sin(v * 38.0)) * smoothstep(-0.3, 0.5, sin(u * 70.0)); c = mix(c, vec3(0.05, 0.12, 0.03), vine * 0.85 * aa1); }',
    '  else if (ty < 4.5) c *= 0.93 + 0.12 * sin(u * 11.0 + v * 17.0);',
    '  else c *= 1.0 + 0.16 * s1 * aa1;',
    '  float e = min(min(u, 1.0 - u), min(v, 1.0 - v));',
    '  c = mix(c, vec3(0.06, 0.11, 0.03), (1.0 - smoothstep(0.025, 0.06, e)) * 0.85);',
    '  diffuseColor.rgb = c;',
    '}',
  ].join('\n'));
};
FIELD_MAT.customProgramCacheKey = () => 'fields1';
export let fieldsMesh = null;
export function buildFields() {
  const { W, H, biome, river, elev, cities, seed } = MAP;
  const TYPES = [['#c4a24a', 0.3], ['#7a9f45', 0.22], ['#86643f', 0.15], ['#9c8a52', 0.12], ['#98a052', 0.17], ['#8f86a8', 0.04]];
  const pick = (r) => { let a = 0; for (let k = 0; k < TYPES.length; k++) { a += TYPES[k][1]; if (r < a) return k; } return 0; };
  const pos = [], col = [], f = [], idx = [];
  const okCell = (x, y) => {
    const cx = Math.round(x), cy = Math.round(y);
    if (cx < 0 || cy < 0 || cx >= W || cy >= H) return false;
    const i = cy * W + cx, b = biome[i];
    return (b === BIOME.PLAINS || b === BIOME.STEPPE) && !river[i] && elev[i] >= 0 && heightAt(x, y) > 0.06;
  };
  const tmp = new THREE.Color();
  for (const c of cities) {
    const rnd = rng32(seed * 7 + c.id * 131);
    const th = c.theta, ct = Math.cos(th), st = Math.sin(th);
    const fw = 0.75 + rnd() * 0.3, fh = 0.5 + rnd() * 0.2;
    const R0 = cityR(c) + 0.25, R1 = c.major ? 3.5 : 2.5;
    const L = (u, v) => [c.x + u * ct - v * st, c.y + u * st + v * ct];
    const nu = Math.ceil(R1 / fw) + 1, nv = Math.ceil(R1 / fh) + 1;
    for (let iv = -nv; iv < nv; iv++) for (let iu = -nu; iu < nu; iu++) {
      const u0 = iu * fw, v0 = iv * fh, uc = u0 + fw / 2, vc = v0 + fh / 2;
      const d = Math.hypot(uc, vc);
      if (d < R0 || d > R1 * (0.72 + rnd() * 0.4)) continue;
      if (rnd() < 0.18) continue;
      const [cx, cy] = L(uc, vc);
      if (masked(cx, cy)) continue;
      if (cities.some((o) => o !== c && Math.hypot(o.x - cx, o.y - cy) < cityR(o) + 0.6)) continue;
      const g = 0.0;
      const corners = [[u0 + g, v0 + g], [u0 + fw - g, v0 + g], [u0 + g, v0 + fh - g], [u0 + fw - g, v0 + fh - g]];
      if (!corners.every(([u, v]) => { const [x, y] = L(u, v); return okCell(x, y) && !masked(x, y); }) || !okCell(cx, cy)) continue;
      const ty = pick(rnd());
      tmp.set(TYPES[ty][0]); const vv = 0.92 + rnd() * 0.16;
      const base = pos.length / 3, S = 3;
      for (let j = 0; j <= S; j++) for (let i = 0; i <= S; i++) {
        const uu = i / S, vq = j / S;
        const [x, y] = L(u0 + g + uu * (fw - 2 * g), v0 + g + vq * (fh - 2 * g));
        pos.push(x - (W - 1) / 2, heightAt(x, y) + 0.025, y - (H - 1) / 2);
        col.push(tmp.r * vv, tmp.g * vv, tmp.b * vv);
        f.push(uu, vq, ty);
      }
      for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) { const a = base + j * (S + 1) + i, b = a + 1, cc = a + S + 1, dd = cc + 1; idx.push(a, cc, b, b, cc, dd); }
      markMask(cx, cy, Math.min(fw, fh) * 0.55);
    }
  }
  fieldsMesh = null;
  if (!pos.length) return;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('aF', new THREE.Float32BufferAttribute(f, 3));
  geo.setIndex(idx); geo.computeVertexNormals();
  fieldsMesh = new THREE.Mesh(geo, FIELD_MAT); fieldsMesh.receiveShadow = true;
  worldGroup.add(fieldsMesh);
}

/* ---------- the city itself: streets, houses and landmarks (render/citygen.js) ---------- */
// each region builds in the style of the power that starts nearest to it; the style stays when the city changes hands
export let cultureCache = null;
export function cultureOf(c) {
  if (!cultureCache || cultureCache.map !== MAP) {
    const caps = startingCapitals(MAP.seed).map((p) => MAP.cities[p.major]);
    cultureCache = { map: MAP, list: MAP.cities.map((d) => {
      let best = 0, bd = Infinity;
      caps.forEach((k, f) => { const dd = Math.hypot(k.x - d.x, k.y - d.y); if (dd < bd) { bd = dd; best = f; } });
      return CULTURE_OF_POWER[best];
    }) };
  }
  return cultureCache.list[c.id];
}
// the direction of the nearest open sea from a port
export function portAngle(c) {
  let best = null, bd = 1e9;
  for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
    const x = c.x + dx, y = c.y + dy;
    if (x < 0 || y < 0 || x >= MAP.W || y >= MAP.H || !MAP.ocean[y * MAP.W + x]) continue;
    const d = Math.hypot(dx, dy); if (d < bd) { bd = d; best = Math.atan2(dy, dx); }
  }
  return best;
}
// the stretches of river through the city, in its own coordinates (the houses keep off them, the streets bridge them)
export function cityWater(c) {
  const R = cityR(c) + 0.6, out = [];
  for (const line of riverLines()) for (let k = 0; k + 1 < line.length; k++) {
    const p = line[k], q = line[k + 1];
    if (Math.hypot(p[0] - c.x, p[1] - c.y) > R && Math.hypot(q[0] - c.x, q[1] - c.y) > R) continue;
    out.push({ a: [p[0] - c.x, p[1] - c.y], b: [q[0] - c.x, q[1] - c.y], w: (p[2] + q[2]) / 2 });
  }
  return out;
}
export function citySpec(c) {
  return { seed: MAP.seed * 31 + c.id * 17, R: cityR(c), gates: c.gates, major: !!c.major, capital: !!c.capital, port: !!c.port,
    portAng: c.port ? portAngle(c) : null, culture: cultureOf(c), imps: c.imps || [], water: cityWater(c) };
}
// what the city's buildings depend on: they are rebuilt when it changes
export const cityLook = (c) => `${(c.imps || []).join(',')}|${c.capital ? 1 : 0}`;
// the city's streets, buildings, banner pole and harbour; far: the light version for distant views
export function cityStaticGeo(c, far = false) {
  const spec = citySpec(c), plan = planCity(spec);
  const parts = cityParts(plan, far);
  // banner pole
  const [px, py, pz] = plan.flagAt;
  c.flagAt = [px, py, pz];
  parts.push({ geo: cyl(0.012, 0.016, c.flagAt[1] + 0.32, 5), color: '#5b4330', pos: [px, (c.flagAt[1] + 0.32) / 2, pz] });
  const R = cityR(c);
  // harbour
  c.dock = null;
  if (c.port && spec.portAng !== null) {
    const ang = spec.portAng, ca = Math.cos(ang), sa = Math.sin(ang);
    // walk out until the water is deep enough
    let r1 = R;
    while (r1 < R + 3 && heightAt(c.x + ca * r1, c.y + sa * r1) > -0.12) r1 += 0.1;
    const h0 = Math.max(0.15, heightAt(c.x, c.y));
    const deckY = 0.09 - h0, r0 = R - 0.1, len = r1 - r0 + 0.25;
    if (len > 0.3 && len < 3.5) {
      const mid = (r0 + r0 + len) / 2;
      parts.push({ geo: box(len, 0.035, 0.16), color: '#8a6a45', pos: [ca * mid, deckY, sa * mid], rot: [0, -ang, 0] });
      for (let k = 0; k <= Math.floor(len / 0.3); k++) for (const sv of [-1, 1]) {
        const r = r0 + k * 0.3, ox = -sa * sv * 0.07, oz = ca * sv * 0.07;
        parts.push({ geo: cyl(0.015, 0.015, 0.4, 5), color: '#5e4430', pos: [ca * r + ox, deckY - 0.18, sa * r + oz] });
      }
      // a moored ship alongside the pier end
      const sr = r0 + len - 0.1, side = 0.26;
      const sx = ca * sr - sa * side, sz = sa * sr + ca * side;
      parts.push({ geo: sph(0.5, 10, 6), color: '#7a5232', pos: [sx, 0.0 - h0, sz], rot: [0, -ang, 0], scale: [0.5, 0.16, 0.15] });
      parts.push({ geo: box(0.36, 0.02, 0.1), color: '#9a7a52', pos: [sx, 0.06 - h0, sz], rot: [0, -ang, 0] });
      parts.push({ geo: cyl(0.01, 0.012, 0.42, 5), color: '#4a3424', pos: [sx, 0.27 - h0, sz] });
      c.dock = { x: sx, y: 0.3 - h0, z: sz, ang };
      markMask(c.x + ca * (r0 + len / 2), c.y + sa * (r0 + len / 2), 0.3);
    }
  }
  const g = shadeUp(merge(parts), 0, 0.35, 0.74, 1.06);
  return g;
}

/* ---------- walls by level (gates face the roads) ---------- */
export function wallGeoFor(c, level) {
  const { parts, towerTops } = wallParts(citySpec(c), level);
  c.towerTops = towerTops;
  if (!parts.length) return new THREE.BufferGeometry();
  return shadeUp(merge(parts), 0, 0.3, 0.8, 1.05);
}

/* ---------- banners (owner coloured, waving) ---------- */
export function flagGeo(list) {
  // list: {x,y,z,w,h} cloth hanging from a pole at (x,y,z), blowing toward +x (all flags share the wind)
  const pos = [], nor = [], wav = [];
  for (const F of list) {
    const g = new THREE.BoxGeometry(F.w, F.h, 0.012, 6, 2, 1).translate(F.w / 2, -F.h / 2, 0).toNonIndexed();
    const p = g.attributes.position, n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i) + F.x, p.getY(i) + F.y, p.getZ(i) + F.z);
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
      wav.push(F.still ? 0 : p.getX(i) / F.w);
    }
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('aWave', new THREE.Float32BufferAttribute(wav, 1));
  return out;
}
export function cityFlagsGeo(c) {
  const L = [];
  const s = c.major ? 1.25 : 0.95;
  L.push({ x: c.flagAt[0], y: c.flagAt[1] + 0.32, z: c.flagAt[2], w: 0.3 * s, h: 0.19 * s });
  if (c.walls >= 2 && c.towerTops) c.towerTops.forEach((p, k) => { if (k % 2 === 0) L.push({ x: p[0], y: p[1] + 0.12, z: p[2], w: 0.13, h: 0.07 }); });
  const g = flagGeo(L);
  if (c.dock) {
    const d = c.dock, ca = Math.cos(d.ang), sa = Math.sin(d.ang);
    const sail = new THREE.PlaneGeometry(0.34, 0.26, 3, 2).toNonIndexed();
    sail.rotateY(-d.ang + PI2 + 0.6);
    const p = sail.attributes.position, n = sail.attributes.normal;
    const P = Array.from(g.attributes.position.array), N = Array.from(g.attributes.normal.array), Wv = Array.from(g.attributes.aWave.array);
    for (let i = 0; i < p.count; i++) {
      const bulge = (1 - Math.pow(p.getY(i) / 0.13, 2)) * (1 - Math.pow(p.getX(i) / 0.17, 2)) * 0.07;
      P.push(p.getX(i) + d.x + ca * bulge, p.getY(i) + d.y, p.getZ(i) + d.z + sa * bulge);
      N.push(n.getX(i), n.getY(i), n.getZ(i)); Wv.push(0);
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    g.setAttribute('aWave', new THREE.Float32BufferAttribute(Wv, 1));
    sail.dispose();
  }
  return g;
}
export function waveFlagMaterial(m) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = FLORA_U.uTime;
    sh.vertexShader = 'attribute float aWave;\nuniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', [
      '#include <begin_vertex>',
      'float ph = modelMatrix[3].x * 1.7 + modelMatrix[3].z * 1.1 + position.y * 3.0;',
      'transformed.z += sin(uTime * 5.5 - position.x * 18.0 + ph) * 0.035 * aWave;',
      'transformed.y += sin(uTime * 3.1 - position.x * 11.0 + ph) * 0.012 * aWave;',
    ].join('\n'));
  };
  m.customProgramCacheKey = () => 'flag-wave';
  return m;
}

export function buildCityMesh(c) {
  if (c.theta === undefined) c.theta = rng32(MAP.seed * 13 + c.id)() * Math.PI;
  const g = new THREE.Group();
  cellToWorld(c.x, c.y, g.position);
  const lod = { far: cityStaticGeo(c, true), near: null, isNear: false };
  g.userData.dispose = () => { lod.far.dispose(); if (lod.near) lod.near.dispose(); };
  const base = new THREE.Mesh(lod.far, MAT.vc);
  base.castShadow = true; base.receiveShadow = true;
  const walls = new THREE.Mesh(wallGeoFor(c, c.walls || 0), MAT.vc);
  walls.castShadow = true; walls.receiveShadow = true;
  const flags = new THREE.Mesh(cityFlagsGeo(c), FLAG_MAT[4]);
  flags.castShadow = true;
  g.add(base, walls, flags);
  worldGroup.add(g);
  c.mesh = { g, base, walls, flags, lod, wallLevel: c.walls || 0, look: cityLook(c) };
  refreshCityMesh(c);
}
export function refreshCityMesh(c) {
  if (!c.mesh) return;
  let flags = false;
  if (c.mesh.look !== cityLook(c)) {                   // an improvement built or looted, a new capital
    const lod = c.mesh.lod;
    lod.far.dispose(); if (lod.near) lod.near.dispose();
    lod.far = cityStaticGeo(c, true); lod.near = null; lod.isNear = false;  // the full version is rebuilt when the camera comes near
    c.mesh.base.geometry = lod.far;
    c.mesh.look = cityLook(c); flags = true;
  }
  if (c.mesh.wallLevel !== c.walls) {
    c.mesh.walls.geometry.dispose(); c.mesh.walls.geometry = wallGeoFor(c, c.walls);
    c.mesh.wallLevel = c.walls; flags = true;
  }
  if (flags) { c.mesh.flags.geometry.dispose(); c.mesh.flags.geometry = cityFlagsGeo(c); }
  c.mesh.flags.material = c.owner >= 0 ? FLAG_MAT[c.owner] : FLAG_MAT[4];
}

/* ---------- forts: a small Roman castrum ---------- */
export let FORT_GEO = null, FORT_FLAG = null;
export function fortGeo() {
  if (FORT_GEO) return FORT_GEO;
  const P = [], wood = '#8a6a45', wood2 = '#6f5134', S = 0.5;
  P.push({ geo: box(1.0, 0.02, 1.0), color: '#a88f6a', pos: [0, 0.01, 0] });
  for (const sz of [-1, 1]) P.push({ geo: box(1.0, 0.22, 0.06), color: wood, pos: [0, 0.11, sz * S] });
  P.push({ geo: box(0.06, 0.22, 1.0), color: wood2, pos: [S, 0.11, 0] });
  for (const sz of [-1, 1]) P.push({ geo: box(0.06, 0.22, 0.38), color: wood2, pos: [-S, 0.11, sz * 0.31] });
  // pointed stakes along the top
  for (let k = 0; k < 12; k++) { const u = -0.46 + k * 0.084; for (const sz of [-1, 1]) P.push({ geo: cone(0.022, 0.06, 4), color: wood, pos: [u, 0.25, sz * S] }); }
  for (const [x, z] of [[S, S], [S, -S], [-S, S], [-S, -S], [-S, 0.15], [-S, -0.15]]) {
    const big = Math.abs(z) > 0.3;
    const th = big ? 0.42 : 0.36;
    P.push({ geo: box(0.15, th, 0.15), color: '#9a7a52', pos: [x, th / 2, z] });
    P.push({ geo: HIP_ROOF, color: '#6b4a2e', pos: [x, th + 0.05, z], scale: [0.21, 0.1, 0.21] });
  }
  // tents and headquarters
  for (let i = 0; i < 3; i++) for (const sz of [-1, 1]) P.push({ geo: GABLE, color: '#efe8d6', pos: [-0.18 + i * 0.17, 0.055, sz * 0.24], scale: [0.11, 0.1, 0.15] });
  P.push({ geo: box(0.24, 0.13, 0.2), color: '#ecdfc4', pos: [0.28, 0.065, 0] });
  P.push({ geo: HIP_ROOF, color: '#c2603b', pos: [0.28, 0.17, 0], scale: [0.28, 0.08, 0.24] });
  P.push({ geo: cyl(0.012, 0.016, 0.7, 5), color: '#5b4330', pos: [0.1, 0.35, 0] });
  FORT_GEO = shadeUp(merge(P), 0, 0.3, 0.78, 1.05); FORT_GEO.userData.shared = true;
  FORT_FLAG = flagGeo([{ x: 0.1, y: 0.7, z: 0, w: 0.3, h: 0.18 }]); FORT_FLAG.userData.shared = true;
  return FORT_GEO;
}
export function buildFortMesh(f) {
  const g = new THREE.Group();
  cellToWorld(f.x, f.y, g.position);
  g.rotation.y = rng32(f.id * 977)() * TAU;
  g.scale.setScalar(1.25);
  const m = new THREE.Mesh(fortGeo(), MAT.vc); m.castShadow = true; m.receiveShadow = true;
  clearFloraAround(f.x, f.y, 1.0);
  const cloth = new THREE.Mesh(FORT_FLAG, FLAG_MAT[f.owner]);
  g.add(m, cloth);
  worldGroup.add(g);
  f.mesh = { g, m, cloth };
  refreshFortMesh(f);
}
export function refreshFortMesh(f) {
  if (!f.mesh) return;
  f.mesh.cloth.material = FLAG_MAT[f.owner];
  const k = f.built >= 1 ? 1 : 0.3 + f.built * 0.7;
  f.mesh.m.scale.set(1, k, 1);
  f.mesh.cloth.visible = f.built >= 1;
}
export function removeFortMesh(f) { if (f.mesh) { worldGroup.remove(f.mesh.g); f.mesh = null; } }
// rebuild every city's buildings (the landmark models have arrived, say)
export function rebuildCities() {
  if (!MAP) return;
  for (const c of MAP.cities) if (c.mesh) { c.mesh.look = null; refreshCityMesh(c); }
}

/* ---------- two levels of detail: the full city near the camera, the light one beyond ---------- */
// a city switches to its full version within CITY_NEAR_IN of the camera and back beyond CITY_NEAR_OUT; the full
// version is built the first time it is needed, a couple of cities per frame at most
export const CITY_NEAR_IN = 22, CITY_NEAR_OUT = 25, CITY_BUILDS_PER_FRAME = 2;
export function updateCityDetail() {
  if (fieldsMesh) fieldsMesh.visible = CAM.d < 125;
  if (!MAP) return;
  const cp = camera.position;
  let builds = 0;
  for (const c of MAP.cities) {
    const m = c.mesh;
    if (!m) continue;
    const p = m.g.position, d = Math.hypot(p.x - cp.x, p.y - cp.y, p.z - cp.z), lod = m.lod;
    const want = lod.isNear ? d < CITY_NEAR_OUT : d < CITY_NEAR_IN;
    if (want === lod.isNear) continue;
    if (want && !lod.near) {
      if (builds >= CITY_BUILDS_PER_FRAME) continue;
      lod.near = cityStaticGeo(c, false); builds++;
    }
    lod.isNear = want;
    m.base.geometry = want ? lod.near : lod.far;
  }
}
