import { THREE } from '../three.js';

/* =========================================================
   Helpers
   ========================================================= */
export { TAU, clamp, lerp, damp, dampAngle, smooth } from './math.js';
export const rand = (a, b) => a + Math.random() * (b - a);
export const randi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
export const $ = (id) => document.getElementById(id);
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
};
export const isTouch = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || ('ontouchstart' in window && !matchMedia('(pointer: fine)').matches);
document.body.classList.toggle('touch', isTouch);
export const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
export const ZAXIS = V3(0, 0, 1);
export const ONE = V3(1, 1, 1);
export const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
export const _q1 = new THREE.Quaternion(), _m4 = new THREE.Matrix4(), _e1 = new THREE.Euler();
