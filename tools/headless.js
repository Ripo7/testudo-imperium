// Wars in plain Node: the simulation without a browser (src/game/ reports through src/game/hooks.js, which stay
// silent here). The tuning tools play their wars with it; tests/headless.test.js checks that a war played here
// is exactly the war the browser plays from the same seed.
import { initCampaign } from '../src/game/campaign.js';
import { simStep } from '../src/game/sim.js';
import { GS, MAP } from '../src/game/state.js';
import { snapshot } from '../src/game/save.js';

export const STEP = 0.1;          // seconds of game time per step, as in the browser
export const TIME_LIMIT = 3600;   // a war still going after an hour counts as unfinished

// a fresh AI-vs-AI war on the continent of this seed, as autoplay starts it
export function newWar(seed, { fog = true } = {}) {
  initCampaign(seed);
  GS.auto = true; GS.speed = 0;
  for (const F of GS.factions) F.isPlayer = false;
  GS.fog = fog; GS.sightT = 0;
}
// play on to game time t (or the end of the war); n steps
export function playUntil(t) { while (!GS.over && GS.time < t - 1e-9) simStep(STEP); }
export function playSteps(n) { for (let i = 0; i < n && !GS.over; i++) simStep(STEP); }
// the state of the war, as a save stores it (without the moment it was taken)
export function stateOf() { const s = snapshot(); delete s.at; return s; }
// a whole war: who won, when, and what each power held at the end
export function playWar(seed, { fog = true, limit = TIME_LIMIT, onMinute } = {}) {
  newWar(seed, { fog });
  for (let m = 1; !GS.over && GS.time < limit; m++) {
    playUntil(Math.min(limit, m * 60));
    if (onMinute) onMinute(m, GS, MAP);
  }
  const provs = GS.factions.map((F) => F.provs);
  return {
    seed, over: !!GS.over, time: Math.round(GS.time),
    winner: GS.over ? GS.winner : provs.indexOf(Math.max(...provs)),
    provs, pts: GS.factions.map((F) => F.pts), alive: GS.factions.map((F) => F.alive),
  };
}
