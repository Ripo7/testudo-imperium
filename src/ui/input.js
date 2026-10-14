import { seesCity } from '../game/sight.js';
import { groundInfo } from '../game/armies.js';
import { THREE } from '../three.js';
import { GS, MAP, menOf, ownerName } from '../game/state.js';
import { _v2, clamp, lerp } from '../core/util.js';
import { Sfx } from '../core/audio.js';
import { camera, canvas } from '../render/renderer.js';
import { cellToWorld } from '../render/world.js';
import { ghost } from '../render/overlays.js';
import { applyCamera, CAM, clampCam, D_MAX, D_MIN, ndc, pickCell, raycaster } from '../render/camera.js';
import { FACTIONS } from '../game/data.js';
import { fortSpotOk } from '../game/economy.js';
import { fmtInt, oddsWord } from './format.js';
import {
  $tip, attackPreview, clearSel, hitTest, issueOrder, ME, myOrderables, placeFortAt, selectThing, stopPlacing,
  tapAt, UI,
} from './state.js';
import { renderPanel } from './panel.js';
import { focusOn, setSpeed } from './hud.js';
import { openMenu, setMuteIcon } from './screens.js';
import { DIR, manualCam, setFollow, togglePolitical } from './director.js';

/* =========================================================
   Input
   ========================================================= */
export const ptrs = new Map();
export let gesture = null;
export const planeY0 = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
export function groundPlane(sx, sy, out) {
  ndc.set(sx / window.innerWidth * 2 - 1, -(sy / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  return raycaster.ray.intersectPlane(planeY0, out || new THREE.Vector3());
}
export function grabPan(g0, sx, sy) {
  const g1 = groundPlane(sx, sy, _v2);
  if (!g0 || !g1) return;
  CAM.x += g0.x - g1.x; CAM.z += g0.z - g1.z; CAM.tx = CAM.x; CAM.tz = CAM.z;
  clampCam(); applyCamera();
}
export const playing = () => UI.mode === 'play';
canvas.addEventListener('pointerdown', (e) => {
  if (!playing()) return;
  Sfx.init();
  try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
  const p = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, type: e.pointerType, moved: false, button: e.button };
  ptrs.set(e.pointerId, p);
  if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()];
    gesture = { type: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), z0: CAM.td, g0: groundPlane((a.x + b.x) / 2, (a.y + b.y) / 2) };
  } else if (ptrs.size === 1) gesture = { type: 'pan', g0: groundPlane(p.x, p.y), button: e.button };
  if (ptrs.size === 2) manualCam();
});
canvas.addEventListener('pointermove', (e) => {
  const p = ptrs.get(e.pointerId);
  if (!p) { if (e.pointerType === 'mouse' && playing()) hover(e.clientX, e.clientY); return; }
  p.x = e.clientX; p.y = e.clientY;
  if (Math.hypot(p.x - p.x0, p.y - p.y0) > (p.type === 'mouse' ? 5 : 10)) p.moved = true;
  if (!gesture) return;
  if (gesture.type === 'pinch' && ptrs.size >= 2) {
    const [a, b] = [...ptrs.values()];
    CAM.td = CAM.d = clamp(gesture.z0 * gesture.d0 / Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), D_MIN, D_MAX);
    applyCamera();
    grabPan(gesture.g0, (a.x + b.x) / 2, (a.y + b.y) / 2);
  } else if (gesture.type === 'pan' && p.moved) { manualCam(); grabPan(gesture.g0, p.x, p.y); $tip.classList.add('hidden'); }
});
export function endPointer(e) {
  const p = ptrs.get(e.pointerId);
  ptrs.delete(e.pointerId);
  if (!p || !gesture) { if (!ptrs.size) gesture = null; return; }
  const ok = e.type === 'pointerup' && playing();
  if (gesture.type === 'pinch' || gesture.type === 'pinchEnd') { gesture = ptrs.size ? { type: 'pinchEnd' } : null; return; }
  if (gesture.type === 'pan') {
    gesture = null;
    if (!ok || p.moved) return;
    if (p.type !== 'mouse') { tapAt(p.x, p.y); return; }
    if (p.button === 0) {
      if (UI.placing) { placeFortAt(pickCell(p.x, p.y)); return; }
      const h = hitTest(p.x, p.y);
      selectThing(h && h.kind === 'prov' ? { kind: 'prov', ref: h.ref } : h, e.shiftKey);
    } else if (p.button === 2) {
      if (UI.placing) { stopPlacing(); return; }
      const h = hitTest(p.x, p.y);
      issueOrder(h && h.kind !== 'prov' ? h : null, h && h.cell ? h.cell : pickCell(p.x, p.y));
    }
  }
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (UI.mode === 'title') return;
  manualCam();
  const before = groundPlane(e.clientX, e.clientY, new THREE.Vector3());
  CAM.td = clamp(CAM.td * Math.exp(e.deltaY * 0.0013), D_MIN, D_MAX);
  if (before && e.deltaY < 0) { CAM.tx = lerp(CAM.tx, before.x, 0.18); CAM.tz = lerp(CAM.tz, before.z, 0.18); }
}, { passive: false });
export let hoverT = 0;
export function hover(sx, sy) {
  const now = performance.now();
  if (now - hoverT < 90) return;
  hoverT = now;
  if (UI.placing) {
    const cell = pickCell(sx, sy);
    if (cell) {
      cellToWorld(Math.round(cell.x), Math.round(cell.y), ghost.position);
      ghost.visible = true;
      ghost.material.color.set(fortSpotOk(ME, cell.x, cell.y) ? 0x7dff86 : 0xff5a4a);
    }
    canvas.style.cursor = 'crosshair';
    return;
  }
  const h = hitTest(sx, sy);
  let tip = '';
  const arms = myOrderables();
  if (h && h.kind !== 'prov') {
    if (arms.length && h.kind === 'city' && h.ref.owner !== ME && !seesCity(h.ref)) tip = `<b>${h.ref.name}</b> · ${ownerName(h.ref.owner)}<br>Out of sight: defenders unknown<br>Right-click to attack anyway`;
    else if (arms.length && ((h.kind === 'army' && h.ref.owner !== ME) || ((h.kind === 'city' || h.kind === 'fort') && h.ref.owner !== ME))) {
      const o = attackPreview(h);
      const [w] = oddsWord(o.p);
      tip = `<b>Right-click to attack</b><br>${Math.round(o.p * 100)}% — ${w} · losses ≈ ${fmtInt(o.attLoss)}`;
      if (o.mods.length) tip += '<br>' + o.mods.map(([n, e2]) => `${n}: ${e2}`).join('<br>');
    } else if (h.kind === 'city') tip = `<b>${h.ref.name}</b> · ${ownerName(h.ref.owner)}<br>${seesCity(h.ref) ? `militia ${fmtInt(h.ref.militia)} · ` : 'defenders unknown · '}walls ${h.ref.walls}`;
    else if (h.kind === 'army') tip = `<b>${FACTIONS[h.ref.owner].adj} army</b> · ${fmtInt(menOf(h.ref.comp))} men${arms.length && h.ref.owner === ME && !UI.sel.includes(h.ref) ? '<br>Right-click to merge' : ''}`;
    canvas.style.cursor = 'pointer';
  } else {
    canvas.style.cursor = arms.length ? 'crosshair' : 'default';
    if (arms.length && h && h.cell) { const g = groundInfo(h.cell.x, h.cell.y); tip = `<b>${g.name}</b> · ${g.pace}`; }
  }
  if (tip) { $tip.innerHTML = tip; $tip.classList.remove('hidden'); $tip.style.left = Math.min(sx + 16, window.innerWidth - 270) + 'px'; $tip.style.top = (sy + 16) + 'px'; }
  else $tip.classList.add('hidden');
}
canvas.addEventListener('pointerleave', () => $tip.classList.add('hidden'));

export const keys = new Set();
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
  keys.add(e.code);
  if (e.repeat || !playing()) return;
  switch (e.code) {
    case 'Space': setSpeed(GS.speed > 0 ? 0 : UI.lastSpeed); break;
    case 'Digit1': setSpeed(1); break;
    case 'Digit2': setSpeed(2); break;
    case 'Digit3': setSpeed(4); break;
    case 'Digit4': setSpeed(8); break;
    case 'KeyP': togglePolitical(); break;
    case 'KeyF': if (GS.auto) setFollow(!DIR.on); break;
    case 'Escape': if (UI.placing) stopPlacing(); else if (UI.sel.length || UI.selCity || UI.selEnemy || UI.selFort || UI.selBattle || UI.selProv != null) { clearSel(); renderPanel(true); } else openMenu(); break;
    case 'KeyH': { const who = GS.auto ? UI.viewF : ME; const cap = MAP.cities.find((c) => c.capital && c.owner === who) || MAP.cities.find((c) => c.owner === who && c.major); if (cap) { manualCam(); focusOn(cap); } break; }
    case 'KeyM': Sfx.init(); Sfx.toggle(); setMuteIcon(); break;
  }
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());
export function keyboardPan(rdt) {
  if (!playing()) return;
  let px = 0, pz = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) pz -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) pz += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) px -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) px += 1;
  if (px || pz) { manualCam(); const sp = CAM.td * 1.0 * rdt; CAM.tx += px * sp; CAM.tz += pz * sp; }
}
