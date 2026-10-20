import { THREE } from '../three.js';
import { $, isTouch } from '../core/util.js';

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

/* ---------- geometry helpers (render/geom.js, shared with the city test page) ---------- */
export { _ge, _gm, _gp, _gq, _gs, box, cone, cyl, merge, sph } from './geom.js';

export const MAT = {
  vc: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 }),
  flora: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, flatShading: true }),
};
