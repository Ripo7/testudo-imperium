import { THREE } from '../three.js';
import { $, isTouch, TAU } from '../core/util.js';

/* =========================================================
   Renderer, scene, camera
   ========================================================= */
export const canvas = $('c');
export let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (e) { $('fatal').classList.remove('hidden'); throw new Error('WebGL is not available'); }
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isTouch ? 1.6 : 2));
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.86;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

export const scene = new THREE.Scene();
export const HORIZON = new THREE.Color('#ebe3d1');
scene.background = HORIZON.clone();
scene.fog = new THREE.Fog(HORIZON, 200, 600);
export const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 2500);
export let portrait = false;
export function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  portrait = camera.aspect < 0.9;
  camera.fov = portrait ? 58 : 42;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

/* ---------- geometry helpers ---------- */
export const cyl = (rt, rb, h, s = 10, open = false, ts = 0, tl = TAU) => new THREE.CylinderGeometry(rt, rb, h, s, 1, open, ts, tl);
export const sph = (r, ws = 10, hs = 8) => new THREE.SphereGeometry(r, ws, hs);
export const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
export const cone = (r, h, s = 8) => new THREE.ConeGeometry(r, h, s);
export const _gm = new THREE.Matrix4(), _gq = new THREE.Quaternion(), _ge = new THREE.Euler(), _gp = new THREE.Vector3(), _gs = new THREE.Vector3();
export function merge(parts, withTint) {
  const prepared = []; let total = 0;
  for (const p of parts) {
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
    if (p.pos || p.rot || p.scale) {
      const r = p.rot || [0, 0, 0];
      _ge.set(r[0], r[1], r[2]); _gq.setFromEuler(_ge);
      const ps = p.pos || [0, 0, 0], sc = p.scale || [1, 1, 1];
      _gm.compose(_gp.set(ps[0], ps[1], ps[2]), _gq, _gs.set(sc[0], sc[1], sc[2]));
      g.applyMatrix4(_gm);
    }
    prepared.push([g, new THREE.Color(p.color), p.tint ? 1 : 0]);
    total += g.attributes.position.count;
  }
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3);
  const tint = withTint ? new Float32Array(total) : null;
  let o = 0;
  for (const [g, c, t] of prepared) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    for (let i = 0; i < n; i++) { const k = (o + i) * 3; col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b; if (tint) tint[o + i] = t; }
    o += n; g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (tint) out.setAttribute('aTint', new THREE.BufferAttribute(tint, 1));
  out.computeBoundingSphere();
  return out;
}

export const MAT = {
  vc: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 }),
  flora: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, flatShading: true }),
};
