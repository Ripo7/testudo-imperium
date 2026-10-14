import { THREE } from '../three.js';
import { MAP } from '../game/state.js';
import { rand } from '../core/util.js';
import { scene } from './renderer.js';
import { cellToWorld } from './world.js';

/* =========================================================
   Overlays: selection rings, path line, fort ghost, dust
   ========================================================= */
export const selRing = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.05, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xfff1a8, transparent: true, opacity: 0.95, depthWrite: false, fog: false }));
selRing.visible = false; selRing.renderOrder = 5; scene.add(selRing);
export const selRings = [];
export function ringFor(i) {
  if (!selRings[i]) { const r = selRing.clone(); r.material = selRing.material; scene.add(r); selRings[i] = r; }
  return selRings[i];
}
export const pathLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: 0xfff1a8, dashSize: 0.5, gapSize: 0.35, transparent: true, opacity: 0.95, depthTest: false }));
pathLine.renderOrder = 6; pathLine.visible = false; scene.add(pathLine);
export const pathLines = [];
export function setPathLine(i, a) {
  let L = pathLines[i];
  if (!L) { L = pathLine.clone(); L.material = pathLine.material.clone(); scene.add(L); pathLines[i] = L; }
  if (!a || !a.path || a.pi >= a.path.length) { L.visible = false; return; }
  const key = a.id + ':' + a.pathVersion + ':' + a.pi;
  if (L.userData.key !== key) {
    L.userData.key = key;
    const pts = [cellToWorld(a.x, a.y)];
    for (let k = a.pi; k < a.path.length; k++) { const c = a.path[k]; pts.push(cellToWorld(c % MAP.W, (c / MAP.W) | 0)); }
    for (const p of pts) p.y = Math.max(p.y, 0) + 0.25;
    L.geometry.dispose(); L.geometry = new THREE.BufferGeometry().setFromPoints(pts); L.computeLineDistances();
  }
  L.material.color.set(a.target && (a.target.kind === 'army' || a.target.kind === 'city' && a.target.ref.owner !== a.owner || a.target.kind === 'fort') ? 0xff7a6a : 0xfff1a8);
  L.visible = true;
}
export const ghost = new THREE.Mesh(new THREE.BoxGeometry(1, 0.3, 1).translate(0, 0.15, 0), new THREE.MeshBasicMaterial({ color: 0x7dff86, transparent: true, opacity: 0.55, depthWrite: false }));
ghost.visible = false; scene.add(ghost);

export const dustTex = (() => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding; return t;
})();
export const dustPool = [];
export function dust(wx, wy, wz, n, spread, life, color) {
  for (let i = 0; i < n; i++) {
    let d = dustPool.find((p) => !p.on);
    if (!d) {
      if (dustPool.length >= 160) return;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: dustTex, color: 0xd9c49a, transparent: true, depthWrite: false, opacity: 0 }));
      scene.add(sp);
      d = { sp, on: false, v: new THREE.Vector3(), t: 0, life: 1, s0: 1 };
      dustPool.push(d);
    }
    d.on = true; d.t = 0; d.life = life * rand(0.7, 1.3); d.s0 = rand(0.5, 1.0) * spread;
    d.sp.material.color.set(color || 0xd9c49a);
    d.sp.position.set(wx + rand(-spread, spread), wy + rand(0.1, 0.4), wz + rand(-spread, spread));
    d.v.set(rand(-0.4, 0.4), rand(0.3, 0.8), rand(-0.4, 0.4));
    d.sp.visible = true;
  }
}
export function updateDust(dt) {
  for (const d of dustPool) {
    if (!d.on) continue;
    d.t += dt;
    const k = d.t / d.life;
    if (k >= 1) { d.on = false; d.sp.visible = false; continue; }
    d.sp.position.addScaledVector(d.v, dt);
    const s = d.s0 * (1 + k * 1.8);
    d.sp.scale.set(s, s, s);
    d.sp.material.opacity = 0.5 * (1 - k) * Math.min(1, k * 6);
  }
}
