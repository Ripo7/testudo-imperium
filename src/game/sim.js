import { SIGHT_EVERY, updateSight } from './sight.js';
import { dipTick } from './diplomacy.js';
import { STAND, updateStanding } from './standing.js';
import { GS, MAP, rnd } from './state.js';
import { diffOf, PLAYER } from './data.js';
import { updateArmy } from './armies.js';
import { detectContacts, updateBattles } from './battles.js';
import { economy } from './economy.js';
import { aiTick } from './ai.js';
import { HOOKS } from './hooks.js';
import { historyTick, recordFall, sampleHistory } from './chronicle.js';

/* =========================================================
   Simulation step
   ========================================================= */
export function simStep(dt) {
  GS.time += dt;
  GS.sightT = (GS.sightT || 0) - dt;
  if (GS.sightT <= 0) { GS.sightT = SIGHT_EVERY; updateSight(); }
  economy(dt);
  for (const a of GS.armies) updateArmy(a, dt);
  detectContacts();
  updateBattles(dt);
  for (const F of GS.factions) {
    if (F.isPlayer || !F.alive) continue;
    F.aiT -= dt;
    if (F.aiT <= 0) { F.aiT = diffOf().tick - 0.3 + rnd() * 0.6; aiTick(F); }
  }
  historyTick();
  GS.checkT -= dt;
  if (GS.checkT <= 0) { GS.checkT = 1; checkFactions(); }
}
export function checkFactions() {
  dipTick();
  for (const F of GS.factions) {
    if (!F.alive) continue;
    const cities = MAP.cities.some((c) => c.owner === F.id);
    const armies = GS.armies.some((a) => !a.dead && a.owner === F.id);
    if (!cities && !armies) { F.alive = false; F.eliminatedAt = GS.time; recordFall(F.id); HOOKS.eliminated(F); }
  }
  if (GS.over) return;
  const majors = MAP.cities.filter((c) => c.major);
  if (GS.auto) {
    updateStanding();
    const lead = GS.factions.find((F) => F.alive && F.provs >= STAND.need);
    const alive = GS.factions.filter((F) => F.alive);
    if (lead || alive.length <= 1) { sampleHistory(); endWar('auto', (lead || alive[0] || GS.factions[0]).id); }
    return;
  }
  updateStanding();
  const mine = GS.factions[PLAYER].provs, need = STAND.need;
  const rival = GS.factions.find((F) => !F.isPlayer && F.alive && F.provs >= need);
  if (mine >= need || GS.factions.every((F) => F.isPlayer || !F.alive)) { sampleHistory(); endWar('win', PLAYER); }
  else if (!majors.some((c) => c.owner === PLAYER) || rival) { GS.rival = rival ? rival.name : null; GS.rivalF = rival ? rival.id : -1; sampleHistory(); endWar('lose', rival ? rival.id : -1); }
}
// the war is over: 'win' or 'lose' for the player, 'auto' when the AI played every power (winner: who won)
export function endWar(over, winner) { GS.over = over; GS.winner = winner; HOOKS.warOver(); }
