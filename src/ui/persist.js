import { restoreSnapshot, snapshot } from '../game/save.js';
import { turnOf } from '../game/turns.js';
import { GS, MAP } from '../game/state.js';
import { $, store } from '../core/util.js';
import { Sfx } from '../core/audio.js';
import { CAM } from '../render/camera.js';
import { VIEW } from '../render/terrain.js';
import { FACTIONS, PLAYER, pName } from '../game/data.js';
import { setME, SPECT, SPEED0, UI } from './state.js';
import { dateOf } from './format.js';
import { enterTurns } from './turnflow.js';
import { renderPanel } from './panel.js';
import { log, updateHUD } from './hud.js';
import { setAuto, showScreen } from './screens.js';
import { togglePolitical } from './director.js';

/* =========================================================
   Save & resume, kept in this browser only
   A save is the war's snapshot (game/save.js) plus what the screen needs to pick it up: the speed and the camera.
   tb: saved since the war is played in turns (an older save's speed was for real time: it resumes at SPEED0).
   ========================================================= */
export const SAVE_KEY = 'testudo.save.v1';
export function canResume() { return !!MAP && GS.factions.length > 0 && !UI.fresh && !GS.over; }
export function serializeGame() {
  const S = snapshot(), playing = UI.mode === 'play';
  S.gs.speed = playing ? (GS.speed || UI.menuSpeed || UI.helpSpeed || UI.lastSpeed || SPEED0) : (UI.resumeSpeed || SPEED0);
  S.tb = 1;
  S.view = playing ? { x: CAM.tx, z: CAM.tz, d: CAM.td, pol: VIEW.political } : (UI.resumeView ? Object.assign({ pol: UI.resumePolitical }, UI.resumeView) : null);
  return S;
}
export function restoreGame(S) {
  restoreSnapshot(S);
  setME(GS.auto ? SPECT : PLAYER);
  UI.resumeSpeed = (S.tb && S.gs.speed) || SPEED0;
  UI.resumeView = S.view ? { x: S.view.x, z: S.view.z, d: S.view.d } : null;
  UI.resumePolitical = S.view ? !!S.view.pol : false;
}
export function saveGame() { if (canResume()) store.set(SAVE_KEY, serializeGame()); }
export function loadSave() { const s = store.get(SAVE_KEY, null); return s && s.v === 1 && s.seed != null && s.gs && Array.isArray(s.armies) ? s : null; }
export function clearSave() { store.del(SAVE_KEY); }
export function resumeInfo() {
  const N = MAP.provinces.length, t = `turn ${turnOf(GS.time)}`;
  if (!GS.auto) return `${pName()} holds ${MAP.provinces.filter((p) => p.owner === PLAYER).length} of ${N} provinces · ${t}`;
  const counts = GS.factions.map((F) => MAP.provinces.filter((p) => p.owner === F.id).length);
  const lead = counts.indexOf(Math.max(...counts));
  return `Autoplay war · ${FACTIONS[lead].name} leads with ${counts[lead]} of ${N} · ${t}`;
}
export function showTitle() {
  const can = canResume();
  $('contBtn').classList.toggle('hidden', !can);
  if (can) $('contInfo').textContent = resumeInfo();
  $('startBtn').classList.toggle('alt', can);
  const pick = FACTIONS[UI.pick || 0];
  $('startBtn').innerHTML = can ? `New campaign<small>Play as ${pick.name} on a fresh continent</small>` : `Play as ${pick.name}<small>Pick your power above</small>`;
  $('autoBtn').innerHTML = can ? 'Autoplay<small>Watch a new war between four AI empires</small>' : 'Autoplay<small>Watch four AI empires fight it out</small>';
  showScreen('title');
}
export function resumeCampaign() {
  if (!canResume()) return;
  Sfx.init(); Sfx.click();
  UI.mode = 'play';
  $('hud').classList.remove('hidden');
  showScreen(null);
  setAuto(GS.auto);
  const v = UI.resumeView;
  if (v) { CAM.tx = v.x; CAM.tz = v.z; CAM.td = v.d; }
  if (!!UI.resumePolitical !== VIEW.political) togglePolitical();
  GS.speed = UI.resumeSpeed || SPEED0; UI.lastSpeed = GS.speed;
  enterTurns();   // between two turns, or the rest of the one that was playing
  log(`<b>Campaign resumed</b>: turn ${turnOf(GS.time)}, ${dateOf(GS.time)}.`, 'info');
  updateHUD(); renderPanel(true);
  saveGame();
  Sfx.horn();
}
