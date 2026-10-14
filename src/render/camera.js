import { THREE } from '../three.js';
import { MAP } from '../game/state.js';
import { _v3, clamp, damp, lerp, smooth } from '../core/util.js';
import { camera, scene } from './renderer.js';
import { cellToWorld, sky, sun } from './world.js';
import { heightAt, updateTerritoryLook } from './terrain.js';
import { updateWater } from './water.js';
import { updateFlora } from './vegetation.js';
import { updateCityDetail } from './cities.js';
import { LIGHT, updateAtmos } from './atmosphere.js';

/* =========================================================
   Camera
   ========================================================= */
export const CAM = { x: 0, z: 0, d: 70, tx: 0, tz: 0, td: 70 };
export const D_MIN = 7, D_MAX = 175;
export const camPitch = (d) => (d < 12 ? lerp(0.34, 0.9, smooth(7, 12, d)) : lerp(0.9, 1.22, clamp((d - 12) / (D_MAX - 12), 0, 1)));
export function applyCamera() {
  const p = camPitch(CAM.d);
  const gh = MAP ? Math.max(0, heightAt(CAM.x + (MAP.W - 1) / 2, CAM.z + (MAP.H - 1) / 2)) * 0.6 : 0;
  camera.position.set(CAM.x, gh + Math.sin(p) * CAM.d, CAM.z + Math.cos(p) * CAM.d);
  camera.lookAt(CAM.x, gh, CAM.z);
  camera.updateMatrixWorld();
}
export function clampCam() {
  if (!MAP) return;
  const hw = MAP.W / 2, hh = MAP.H / 2;
  CAM.tx = clamp(CAM.tx, -hw, hw); CAM.tz = clamp(CAM.tz, -hh, hh + 10); CAM.td = clamp(CAM.td, D_MIN, D_MAX);
  CAM.x = clamp(CAM.x, -hw, hw); CAM.z = clamp(CAM.z, -hh, hh + 10);
}
export function updateCameraRig(rdt) {
  clampCam();
  const k = 9;
  CAM.x = damp(CAM.x, CAM.tx, k, rdt); CAM.z = damp(CAM.z, CAM.tz, k, rdt); CAM.d = damp(CAM.d, CAM.td, k, rdt);
  applyCamera();
  sky.position.copy(camera.position);
  // shadows follow the view
  const s = clamp(CAM.d * 0.9, 30, 140);
  const sc = sun.shadow.camera;
  if (Math.abs(sc.right - s) > 2) { sc.left = -s; sc.right = s; sc.top = s; sc.bottom = -s; sc.near = 1; sc.far = 400; sc.updateProjectionMatrix(); }
  sun.position.set(CAM.x + LIGHT.off.x, LIGHT.off.y, CAM.z + LIGHT.off.z);
  sun.target.position.set(CAM.x, 0, CAM.z);
  sun.target.updateMatrixWorld();
  scene.fog.near = CAM.d * 1.6; scene.fog.far = CAM.d * 5 + 120;
  updateTerritoryLook();
  updateWater();
  updateAtmos();
  updateFlora();
  updateCityDetail();
}
export const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
// screen -> cell coordinates (marches the ray over the heightfield)
export function pickCell(sx, sy) {
  if (!MAP) return null;
  ndc.set(sx / window.innerWidth * 2 - 1, -(sy / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const o = raycaster.ray.origin, d = raycaster.ray.direction;
  let prev = 0, t = 0;
  const step = 0.6;
  for (let k = 0; k < 2000; k++) {
    t += step;
    const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
    const cx = x + (MAP.W - 1) / 2, cy = z + (MAP.H - 1) / 2;
    const gh = (cx >= 0 && cy >= 0 && cx < MAP.W - 1 && cy < MAP.H - 1) ? Math.max(heightAt(cx, cy), 0) : 0;
    if (y <= gh) {
      let a = prev, b = t;
      for (let it = 0; it < 12; it++) {
        const m = (a + b) / 2, X = o.x + d.x * m, Y = o.y + d.y * m, Z = o.z + d.z * m;
        const cx2 = X + (MAP.W - 1) / 2, cy2 = Z + (MAP.H - 1) / 2;
        const gh2 = (cx2 >= 0 && cy2 >= 0 && cx2 < MAP.W - 1 && cy2 < MAP.H - 1) ? Math.max(heightAt(cx2, cy2), 0) : 0;
        if (Y <= gh2) b = m; else a = m;
      }
      const X = o.x + d.x * b, Z = o.z + d.z * b;
      return { x: X + (MAP.W - 1) / 2, y: Z + (MAP.H - 1) / 2 };
    }
    prev = t;
    if (y < -5) break;
  }
  return null;
}
export function projectCell(x, y, hOff, out) {
  cellToWorld(x, y, _v3); _v3.y = Math.max(_v3.y, 0) + (hOff || 0);
  _v3.project(camera);
  out = out || {};
  out.x = (_v3.x + 1) / 2 * window.innerWidth; out.y = (1 - _v3.y) / 2 * window.innerHeight; out.vis = _v3.z < 1;
  return out;
}
