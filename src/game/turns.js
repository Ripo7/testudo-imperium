import { GS } from './state.js';
import { TURN_TIME } from './data.js';
import { aiPlan } from './ai.js';

/* =========================================================
   Turns
   The war is played in turns of TURN_TIME seconds of game time. At the start of each turn every power makes its
   plans from the same picture of the world: the AI's armies here (aiPlan), the player's on screen, while the world
   waits; then the turn plays out for everyone at once (simultaneous turns), and stops at the next one.
   The simulation itself still advances in small steps (simStep); a turn is a stretch of them. GS.planAt is when
   the next plans are due, so a war played straight through (the tools, the tests) plans at the same moments.
   ========================================================= */
export const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];
// the turn under way at time t (turn 1 starts at 0), when it began and when it ends
export const turnOf = (t) => Math.floor(t / TURN_TIME + 1e-6) + 1;
export const turnStartOf = (t) => (turnOf(t) - 1) * TURN_TIME;
export const turnEndOf = (t) => turnOf(t) * TURN_TIME;
// how many turns a stretch of game time covers, counting a part of one as one
export const turnsIn = (s) => Math.max(0, Math.ceil(s / TURN_TIME - 1e-6));
// a stretch of game time in turns, a part of one counting as one: "1 turn", "5 turns" (texts of the game and the screen)
export const turnsTxt = (s) => { const n = Math.max(1, turnsIn(s)); return n === 1 ? '1 turn' : `${n} turns`; };
// how many whole turns have gone by: "12 turns"
export const turnsDone = (s) => { const n = Math.floor(s / TURN_TIME + 1e-6); return n === 1 ? '1 turn' : `${n} turns`; };
/** A new turn begins: every AI power gives its armies their orders. Runs once per turn (false if already done). */
export function beginTurn() {
  if (GS.time + 1e-6 < (GS.planAt || 0)) return false;
  GS.planAt = turnEndOf(GS.time);
  for (const F of GS.factions) if (!F.isPlayer && F.alive) aiPlan(F);
  return true;
}
