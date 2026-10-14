import { dipTick } from './diplomacy.js';
import { STAND, updateStanding } from './standing.js';
import { GS, MAP } from './state.js';
import { diffOf, PLAYER } from './data.js';
import { updateArmy } from './armies.js';
import { detectContacts, updateBattles } from './battles.js';
import { economy } from './economy.js';
import { aiTick } from './ai.js';
import { endAuto, endCampaign, onEliminated } from '../ui/hud.js';

/* =========================================================
   Simulation step
   ========================================================= */
export function simStep(dt) {
  GS.time += dt;
  economy(dt);
  for (const a of GS.armies) updateArmy(a, dt);
  detectContacts();
  updateBattles(dt);
  for (const F of GS.factions) {
    if (F.isPlayer || !F.alive) continue;
    F.aiT -= dt;
    if (F.aiT <= 0) { F.aiT = diffOf().tick - 0.3 + Math.random() * 0.6; aiTick(F); }
  }
  GS.checkT -= dt;
  if (GS.checkT <= 0) { GS.checkT = 1; checkFactions(); }
}
export function checkFactions() {
  dipTick();
  for (const F of GS.factions) {
    if (!F.alive) continue;
    const cities = MAP.cities.some((c) => c.owner === F.id);
    const armies = GS.armies.some((a) => !a.dead && a.owner === F.id);
    if (!cities && !armies) { F.alive = false; F.eliminatedAt = GS.time; onEliminated(F); }
  }
  if (GS.over) return;
  const majors = MAP.cities.filter((c) => c.major);
  if (GS.auto) {
    updateStanding();
    const lead = GS.factions.find((F) => F.alive && F.pts >= STAND.need);
    const alive = GS.factions.filter((F) => F.alive);
    if (lead || alive.length <= 1) endAuto(lead || alive[0] || GS.factions[0]);
    return;
  }
  updateStanding();
  const mine = GS.factions[PLAYER].pts, need = STAND.need;
  const rival = GS.factions.find((F) => !F.isPlayer && F.pts >= need);
  if (mine >= need || GS.factions.every((F) => F.isPlayer || !F.alive)) endCampaign(true);
  else if (!majors.some((c) => c.owner === PLAYER) || rival) { GS.rival = rival ? rival.name : null; endCampaign(false); }
}
