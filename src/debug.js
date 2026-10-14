// Test and debugging hook: open the game with ?test to expose its internals as window.__T.
// The scripts in tests/ and tools/ drive the simulation through it. Normal players never load this file.
import * as util from './core/util.js';
import * as audio from './core/audio.js';
import * as generate from './map/generate.js';
import * as renderer from './render/renderer.js';
import * as camera from './render/camera.js';
import * as data from './game/data.js';
import * as state from './game/state.js';
import * as campaign from './game/campaign.js';
import * as armies from './game/armies.js';
import * as battles from './game/battles.js';
import * as economy from './game/economy.js';
import * as standing from './game/standing.js';
import * as diplomacy from './game/diplomacy.js';
import * as ai from './game/ai.js';
import * as sim from './game/sim.js';
import * as save from './game/save.js';
import * as uiState from './ui/state.js';
import * as panel from './ui/panel.js';
import * as hud from './ui/hud.js';
import * as screens from './ui/screens.js';
import * as main from './main.js';

const spaces = [util, audio, generate, renderer, camera, data, state, campaign, armies, battles, economy, standing, diplomacy, ai, sim, save, uiState, panel, hud, screens, main];
const extras = {
  setNoRender: (v) => main.setTestNoRender(v),
  setFreeze: (v) => main.setTestFreeze(v),
};
// module namespaces are live views, so MAP, ME and the like always read their current value
window.__T = new Proxy(extras, {
  get(target, key) {
    if (key in target) return target[key];
    for (const ns of spaces) if (key in ns) return ns[key];
    return undefined;
  },
  has(target, key) { return key in target || spaces.some((ns) => key in ns); },
});
