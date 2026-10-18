import { fogRules, sees, SIGHT } from '../game/sight.js';
import { GS } from '../game/state.js';
import { PLAYER } from '../game/data.js';
import { UI } from './state.js';

/* =========================================================
   What is drawn on screen under the fog of war: what the player's power sees,
   or in autoplay the power being followed (SIGHT.on: the fog is drawn right now)
   ========================================================= */
export const viewer = () => (GS.auto ? UI.viewF : PLAYER);
export const fogShown = () => fogRules() && UI.mode === 'play' && viewer() >= 0;
export const canSee = (x, y) => !SIGHT.on || sees(viewer(), x, y);
export const seesArmy = (a) => !SIGHT.on || a.owner === viewer() || canSee(a.x, a.y);
export const seesBattle = (B) => !SIGHT.on || B.sides.some((s) => s.faction === viewer()) || canSee(B.x, B.y);
export const seesCity = (c) => !SIGHT.on || c.owner === viewer() || canSee(c.x, c.y);
