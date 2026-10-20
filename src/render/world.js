import { THREE } from '../three.js';
import { MAP } from '../game/state.js';
import { isTouch } from '../core/util.js';
import { HORIZON, renderer, scene } from './renderer.js';
import { buildTerrain, heightAt, resetOwnership } from './terrain.js';
import { buildRivers, SUN_DIR, WATER_MAT } from './water.js';
import { buildTrees } from './vegetation.js';
import { buildCityMesh, buildFields, buildRoads, waveFlagMaterial } from './cities.js';
import { LIGHT, SKY_MAT, withClouds } from './atmosphere.js';
import { FACTIONS } from '../game/data.js';
import { DISPUTED } from '../game/standing.js';

/* =========================================================
   World build
   ========================================================= */
export let water, treesMesh, riverMeshes = [], sun, sky;
export const FCOL = [];
// THREE.Color per faction (linear)
export const NEUTRAL_COL = new THREE.Color('#8f8a80');
export const FLAG_MAT = [];
// per faction (+ neutral at index 4)
export const worldGroup = new THREE.Group();
scene.add(worldGroup);

export function cellToWorld(x, y, out) {
  return (out || new THREE.Vector3()).set(x - (MAP.W - 1) / 2, heightAt(x, y), y - (MAP.H - 1) / 2);
}
export function elevToHeight(e) {
  if (e < 0) return Math.max(-4, e * 14) - 0.05;
  return 0.12 + e * 3.2 + Math.max(0, e - MAP.eHill) * 20 + Math.max(0, e - MAP.eSnow) * 10;
}

export function buildEnvironment() {
  const pm = new THREE.PMREMGenerator(renderer);
  const es = new THREE.Scene();
  const eg = new THREE.SphereGeometry(10, 24, 12);
  HORIZON.set(LIGHT.haze); scene.background.copy(HORIZON); scene.fog.color.copy(HORIZON);
  SUN_DIR.copy(LIGHT.off).normalize();
  const ecol = [], c = new THREE.Color(), top = new THREE.Color('#8fb0da'), hor = new THREE.Color('#ffe9cc'), bot = new THREE.Color('#7d6c4c');
  const ep = eg.attributes.position;
  for (let i = 0; i < ep.count; i++) { const y = ep.getY(i) / 10; if (y > 0) c.copy(hor).lerp(top, Math.pow(y, 0.6)); else c.copy(hor).lerp(bot, Math.min(1, -y * 3)); ecol.push(c.r, c.g, c.b); }
  eg.setAttribute('color', new THREE.Float32BufferAttribute(ecol, 3));
  es.add(new THREE.Mesh(eg, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  scene.environment = pm.fromScene(es, 0.04).texture;
  pm.dispose();
  scene.add(new THREE.HemisphereLight(LIGHT.skyCol, LIGHT.groundCol, LIGHT.hemiI));
  sun = new THREE.DirectionalLight(LIGHT.sunCol, LIGHT.sunI);
  sun.castShadow = true;
  const sm = isTouch ? 1024 : 2048;
  sun.shadow.mapSize.set(sm, sm);
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.05;
  scene.add(sun, sun.target);
  sky = new THREE.Mesh(new THREE.SphereGeometry(1800, 32, 16), SKY_MAT);
  sky.renderOrder = -10;
  scene.add(sky);
  // far ocean floor + water
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#173b5c', roughness: 1 }));
  floor.position.y = -4.2;
  scene.add(floor);
  water = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000).rotateX(-Math.PI / 2), WATER_MAT);
  water.position.y = 0.0;
  water.renderOrder = 1;
  scene.add(water);
  for (let i = 0; i < 4; i++) {
    FCOL[i] = new THREE.Color(FACTIONS[i].color);
    FLAG_MAT[i] = withClouds(waveFlagMaterial(new THREE.MeshStandardMaterial({ color: FACTIONS[i].color, roughness: 0.6, side: THREE.DoubleSide })));
  }
  FLAG_MAT[4] = withClouds(waveFlagMaterial(new THREE.MeshStandardMaterial({ color: '#d8d2c4', roughness: 0.7, side: THREE.DoubleSide })));
}

export function clearWorld() {
  borderLines = null; borderMesh = null; borderSig = ''; resetOwnership();
  while (worldGroup.children.length) {
    const o = worldGroup.children.pop();
    o.traverse && o.traverse((m) => { if (m.geometry && !m.geometry.userData.shared) m.geometry.dispose(); });
    if (o.userData.dispose) o.userData.dispose();      // geometries kept aside (a city's other level of detail)
  }
  riverMeshes = [];
}

export function buildWorld() {
  clearWorld();
  buildTerrain();
  buildRivers();
  buildRoads();
  buildFields();
  buildTrees();
  for (const c of MAP.cities) buildCityMesh(c);
}

/* ---------- province borders: smoothed two-tone ribbons ---------- */
export let borderLines = null, borderMesh = null, borderSig = '';
export function refreshBorders(sig) { if (sig !== borderSig) { borderSig = sig; buildBorderMesh(); } }
export function extractBorders() {
  const { W, H, prov } = MAP, CW = W + 1;
  const P = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? -1 : prov[y * W + x];
  const groups = new Map();
  const add = (a, b, p, q) => { const k = Math.min(p, q) * 1000 + Math.max(p, q); let g = groups.get(k); if (!g) { g = { p: Math.min(p, q), q: Math.max(p, q), edges: [] }; groups.set(k, g); } g.edges.push({ a, b, used: false, x: 0, y: 0 }); };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = P(x, y); if (p < 0) continue;
    const q = P(x + 1, y); if (q >= 0 && q !== p) add((x + 1) + y * CW, (x + 1) + (y + 1) * CW, p, q);
    const r = P(x, y + 1); if (r >= 0 && r !== p) add(x + (y + 1) * CW, (x + 1) + (y + 1) * CW, p, r);
  }
  const lines = [];
  for (const g of groups.values()) {
    const cm = new Map();
    for (const e of g.edges) { for (const c of [e.a, e.b]) { let l = cm.get(c); if (!l) { l = []; cm.set(c, l); } l.push(e); } }
    const walk = (start) => { const pts = [start]; let cur = start; for (;;) { const n = cm.get(cur).find((e) => !e.used); if (!n) break; n.used = true; cur = n.a === cur ? n.b : n.a; pts.push(cur); } return pts; };
    for (const [c, l] of cm) if (l.length % 2 === 1) while (l.some((e) => !e.used)) { const pts = walk(c); if (pts.length > 1) lines.push({ c: pts, p: g.p, q: g.q }); }
    for (const e of g.edges) if (!e.used) { const pts = walk(e.a); if (pts.length > 1) lines.push({ c: pts, p: g.p, q: g.q }); }
  }
  for (const L of lines) {
    let pts = L.c.map((c) => [c % CW - 0.5, Math.floor(c / CW) - 0.5]);
    // which province lies to the left of the first segment?
    const [ax, ay] = pts[0], [bx, by] = pts[1];
    const nx = -(by - ay), ny = bx - ax;
    const sx = (ax + bx) / 2 + nx * 0.5, sy = (ay + by) / 2 + ny * 0.5;
    L.left = P(Math.round(sx), Math.round(sy)) === L.p ? L.p : L.q;
    L.right = L.left === L.p ? L.q : L.p;
    const closed = pts.length > 3 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1];
    for (let it = 0; it < 3; it++) {
      const np = closed ? [] : [pts[0]];
      for (let k = 0; k < pts.length - 1; k++) { const [x0, y0] = pts[k], [x1, y1] = pts[k + 1]; np.push([x0 * 0.75 + x1 * 0.25, y0 * 0.75 + y1 * 0.25], [x0 * 0.25 + x1 * 0.75, y0 * 0.25 + y1 * 0.75]); }
      if (closed) np.push(np[0]); else np.push(pts[pts.length - 1]);
      pts = np;
    }
    L.pts = pts;
  }
  borderLines = lines;
}
export const BORDER_U = { uBW: { value: 1 } };
export const BORDER_MAT = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
BORDER_MAT.onBeforeCompile = (sh) => {
  Object.assign(sh.uniforms, BORDER_U);
  sh.vertexShader = 'attribute vec2 aOff;\nuniform float uBW;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.xz += aOff * (uBW - 1.0);');
};
BORDER_MAT.customProgramCacheKey = () => 'border-w';
BORDER_MAT.toneMapped = false;
// ribbons show the exact banner colours
export function buildBorderMesh() {
  if (!borderLines) extractBorders();
  const pos = [], col = [], off = [], idx = [];
  const dark = new THREE.Color('#1c1611'), neutral = new THREE.Color('#e9e2d2');
  const ownC = (o) => (o >= 0 ? new THREE.Color(FACTIONS[o].css) : neutral);
  const band = (pts, sgn, w0, w1, c, a0, a1) => {
    const base = pos.length / 3;
    for (let k = 0; k < pts.length; k++) {
      const [x, y] = pts[k];
      const [px, py] = pts[Math.max(0, k - 1)], [qx, qy] = pts[Math.min(pts.length - 1, k + 1)];
      let tx = qx - px, ty = qy - py; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
      const nx = -ty * sgn, ny = tx * sgn;
      const hh = Math.max(heightAt(x, y), heightAt(x + nx * w1 * 2, y + ny * w1 * 2), 0.02) + 0.08;
      for (const [w, a] of [[w0, a0], [w1, a1]]) {
        pos.push(x + nx * w - (MAP.W - 1) / 2, hh, y + ny * w - (MAP.H - 1) / 2);
        off.push(nx * w, ny * w);
        col.push(c.r, c.g, c.b, a);
      }
      if (k > 0) { const a = base + (k - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
  };
  for (const L of borderLines) {
    const ol = MAP.provinces[L.left].owner, or = MAP.provinces[L.right].owner;
    const pts = L.pts;
    if (ol === or && ol !== DISPUTED) { band(pts, 1, 0, 0.05, dark, 0.7, 0.55); band(pts, -1, 0, 0.05, dark, 0.7, 0.55); continue; }
    for (const [sgn, o] of [[1, ol], [-1, or]]) {
      band(pts, sgn, 0, 0.055, dark, 0.95, 0.95);
      if (o >= 0) band(pts, sgn, 0.055, 0.3, ownC(o), 1, 0.5);
      else band(pts, sgn, 0.055, 0.12, neutral, 0.85, 0.4);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  geo.setAttribute('aOff', new THREE.Float32BufferAttribute(off, 2));
  geo.setIndex(idx);
  if (borderMesh) { borderMesh.geometry.dispose(); borderMesh.geometry = geo; }
  else { borderMesh = new THREE.Mesh(geo, BORDER_MAT); borderMesh.renderOrder = 2; borderMesh.frustumCulled = false; worldGroup.add(borderMesh); }
}
