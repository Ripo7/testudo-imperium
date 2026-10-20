import { SIGHT } from './game/sight.js';
import { fogShown, seesBattle } from './ui/view.js';
import { PROV } from './game/standing.js';
import { updateTerrainColors } from './render/terrain.js';
import { initAtmosphere, updateFogTexture } from './render/atmosphere.js';
import { GS, MAP } from './game/state.js';
import { Sfx } from './core/audio.js';
import { camera, renderer, scene } from './render/renderer.js';
import { buildEnvironment } from './render/world.js';
import { updateDust } from './render/overlays.js';
import { CAM, projectCell, updateCameraRig } from './render/camera.js';
import { buildCrowdGeos, loadCloseModels, updateCrowds } from './render/crowds.js';
import { loadLandmarkModels } from './render/landmarkModels.js';
import { rebuildCities } from './render/cities.js';
import { _pp, UI, worldRuns } from './ui/state.js';
import { advanceTurn, initTurns, updateTurnBar } from './ui/turnflow.js';
import { initPanel, renderPanel } from './ui/panel.js';
import { defaultHint, initHooks, updateHUD, updateLog } from './ui/hud.js';
import { $labels, updateLabels, updateSelectionVisuals } from './ui/labels.js';
import { keyboardPan } from './ui/input.js';
import { initScreens, prepareCampaign } from './ui/screens.js';
import { clearSave, loadSave, resumeCampaign, saveGame, showTitle } from './ui/persist.js';
import { updateDirector } from './ui/director.js';

/* =========================================================
   Boot & loop
   ========================================================= */
initHooks();
initAtmosphere();
initPanel();
initScreens();
initTurns();
buildEnvironment();
buildCrowdGeos();
loadCloseModels();
loadLandmarkModels(rebuildCities);   // the cities are rebuilt with the Blender landmarks once they arrive

// Start from (in order) the state handed over by a live page update, the save in this browser, or a fresh continent.
function boot(data) {
  const hotSave = data && data.save;
  const saved = hotSave || loadSave();
  let restored = false;
  if (saved) {
    try { prepareCampaign(0, saved); restored = true; }
    catch (e) { clearSave(); }
  }
  if (!restored) prepareCampaign((Math.random() * 1e9) | 0);
  if (restored && hotSave && data.mode === 'play') resumeCampaign();
  else showTitle();
  requestAnimationFrame(frame);
}

let last = performance.now(), testFreeze = false, testNoRender = false, battleSoundT = 0, saveT = 15, provV = -1;
// test hooks (see src/debug.js)
export function setTestNoRender(v) { testNoRender = v; }
export function setTestFreeze(v) { testFreeze = v; }
function frame(now) {
  requestAnimationFrame(frame);
  const rawDt = Math.max(0, (now - last) / 1000);
  const rdt = Math.min(0.05, rawDt);
  last = now;
  if (!testFreeze) advanceTurn(rawDt);   // the turn that is playing out (ui/turnflow.js)
  if (UI.mode === 'title') { UI.t0 = (UI.t0 || 0) + rdt; CAM.tx += Math.sin(UI.t0 * 0.05) * rdt * 2.5; CAM.tz += Math.cos(UI.t0 * 0.04) * rdt * 1.5; CAM.td = 115; }
  keyboardPan(rdt);
  updateDirector(rdt);
  updateCameraRig(rdt);
  UI.t += rdt * (worldRuns() || UI.mode !== 'play' ? 1 : 0.15);   // between turns the soldiers barely stir
  updateCrowds(UI.t);
  updateDust(rdt);
  SIGHT.on = fogShown(); updateFogTexture();
  if (PROV.version !== provV && MAP) { provV = PROV.version; updateTerrainColors(); }   // a place changed hands: repaint the provinces
  if (UI.mode === 'play') {
    updateSelectionVisuals();
    updateTurnBar();
    UI.hudT -= rdt;
    if (UI.hudT <= 0) { UI.hudT = 0.25; updateHUD(); renderPanel(false); updateLog(); defaultHint(); }
    saveT -= rdt;
    if (saveT <= 0) { saveT = 15; saveGame(); }
    battleSoundT -= rdt;
    if (battleSoundT <= 0 && worldRuns()) {
      battleSoundT = 0.35;
      const vis = GS.battles.some((B) => !B.done && seesBattle(B) && projectCell(B.x, B.y, 0, _pp).vis && _pp.x > 0 && _pp.x < window.innerWidth && _pp.y > 0 && _pp.y < window.innerHeight);
      if (vis && CAM.d < 110) { if (Math.random() < 0.5) Sfx.clang(); else Sfx.hit(); }
    }
  }
  $labels.style.visibility = UI.mode === 'title' ? 'hidden' : 'visible';
  updateLabels();
  if (!testNoRender) renderer.render(scene, camera);
}
boot({});

// ?test exposes the game's internals for the browser tests (src/debug.js)
if (new URLSearchParams(location.search).has('test')) import('./debug.js');
