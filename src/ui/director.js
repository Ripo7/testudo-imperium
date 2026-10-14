import { seesArmy, seesBattle } from '../game/sight.js';
import { GS, MAP, menOf } from '../game/state.js';
import { $, clamp, damp } from '../core/util.js';
import { CAM } from '../render/camera.js';
import { VIEW } from '../render/terrain.js';
import { sideMen } from '../game/battles.js';
import { UI } from './state.js';
import { renderPanel } from './panel.js';
import { flashHint } from './hud.js';

/* =========================================================
   Map mode & the autoplay camera director
   ========================================================= */
export function togglePolitical() { VIEW.political = !VIEW.political; $('btnMap').classList.toggle('on', VIEW.political); }
export const DIR = {
  on: false, tgt: null, hold: 0, lastB: null,
  busy() { return !!(this.tgt && this.tgt.kind === 'battle' && !this.tgt.ref.done && this.hold > 0); },
  busyBig() { return this.busy() && battleMen(this.tgt.ref) > 2500; },
};
export function battleMen(B) { return sideMen(B.sides[0]) + sideMen(B.sides[1]); }
export function setFollow(on) {
  DIR.on = !!on && GS.auto;
  if (DIR.on) { DIR.tgt = null; DIR.hold = 0; }
  $('btnFollow').classList.toggle('on', DIR.on);
  if (UI.selEnemy) renderPanel(true);
}
export function manualCam() { if (DIR.on) { setFollow(false); flashHint('Camera released · press <b>Follow</b> (F) to give it back'); } }
export function directorPick() {
  // a selected army is followed; otherwise the biggest fight, then the biggest army on the march
  if (UI.selEnemy && !UI.selEnemy.dead && seesArmy(UI.selEnemy)) return { kind: 'army', ref: UI.selEnemy, hold: 1e9 };
  let best = null, bs = 0;
  for (const B of GS.battles) {
    if (B.done || !seesBattle(B)) continue;
    const s = battleMen(B) * (B.kind === 'city' && B.place.major ? 1.6 : 1) * (B === DIR.lastB ? 0.6 : 1);
    if (s > bs) { bs = s; best = B; }
  }
  if (best && bs > 250) { DIR.lastB = best; return { kind: 'battle', ref: best, hold: 6 }; }
  let ba = null, am = 0;
  for (const a of GS.armies) {
    if (a.dead || a.state !== 'move' || !a.target || a.target.kind === 'merge' || !seesArmy(a)) continue;
    if (a.target.ref.owner === a.owner) continue;
    const m = menOf(a.comp);
    if (m > am) { am = m; ba = a; }
  }
  if (ba && am > 400) return { kind: 'army', ref: ba, hold: 7 };
  return { kind: 'spot', x: (MAP.W - 1) / 2, y: (MAP.H - 1) / 2 + 6, d: 150, hold: 6 };
}
export function updateDirector(rdt) {
  if (!DIR.on || UI.mode !== 'play' || GS.over) return;
  if (GS.speed > 0) DIR.hold -= rdt;
  let T = DIR.tgt;
  if (T && T.kind === 'army' && T.ref.dead && T.ref.mergedInto && !T.ref.mergedInto.dead) T.ref = T.ref.mergedInto;
  const valid = T && (T.kind === 'battle' ? !T.ref.done : T.kind === 'army' ? !T.ref.dead : true);
  const extend = valid && T.kind === 'battle' && DIR.hold <= 0 && DIR.hold > -8;   // stay on a fight until it ends (for a while)
  if (!valid || (DIR.hold <= 0 && !extend)) {
    const n = directorPick();
    DIR.tgt = T = n; DIR.hold = n.hold;
  }
  let x, y, d;
  if (T.kind === 'battle') { x = T.ref.x; y = T.ref.y; d = clamp(30 + Math.sqrt(battleMen(T.ref)) * 0.35, 34, 62); }
  else if (T.kind === 'army') { x = T.ref.x; y = T.ref.y; d = clamp(34 + Math.sqrt(menOf(T.ref.comp)) * 0.3, 36, 58); }
  else { x = T.x; y = T.y; d = T.d; }
  const gx = x - (MAP.W - 1) / 2, gz = y - (MAP.H - 1) / 2 + d * 0.06;
  const k = T.kind === 'army' ? 2.6 : 1.5;
  CAM.tx = damp(CAM.tx, gx, k, rdt); CAM.tz = damp(CAM.tz, gz, k, rdt);
  CAM.td = damp(CAM.td, d, 1.1, rdt);
}
