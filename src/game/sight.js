import { cellOf, GS, MAP, menOf } from './state.js';
import { clamp } from '../core/util.js';
import { BIOME } from '../map/generate.js';
import { NEUTRAL, PLAYER, sigOf } from './data.js';
import { UI } from '../ui/state.js';

/* =========================================================
   Fog of war
   Every power sees only the land around its cities, armies and forts;
   cavalry scouts and high ground see further. The AI plays by the same rule:
   it only reacts to enemy armies it can see, and judges unseen cities by what
   it last saw of them (or by their size and walls, if it never saw inside).
   The sight grids are part of the simulation (updated in simStep), so the
   game stays deterministic. On screen the fog shows what the player's power
   sees, or in autoplay the power being followed.
   ========================================================= */
export const SIGHT_R = { major: 9, town: 6.5, perWall: 0.6, army: 6, scouts: 3, high: 1.5, fort: 8, fortBuilding: 4 };
export const SIGHT_EVERY = 0.5;   // seconds of game time between updates
export const INTEL_FRESH = 60;    // seconds a report on a city stays trustworthy
// grids[f][i]: 0 (unseen) .. 255 (in plain sight), soft at the edges so the fog can be drawn smoothly
// on: whether the fog is drawn on screen right now
export const SIGHT = { on: false, grids: [], version: 0 };
const SEEN = 90;

export const fogRules = () => !!(MAP && GS.fog);
export const viewer = () => (GS.auto ? UI.viewF : PLAYER);
export const fogShown = () => fogRules() && UI.mode === 'play' && viewer() >= 0;

export function sightRange(a) {
  const men = menOf(a.comp), riders = a.comp.cav + (sigOf(a.owner).mounted ? a.comp.leg : 0);
  let r = SIGHT_R.army + (men > 0 && riders / men >= 0.25 ? SIGHT_R.scouts : 0);
  const b = MAP.biome[cellOf(a.x, a.y)];
  if (b === BIOME.HILLS || b === BIOME.MOUNTAIN) r += SIGHT_R.high;
  return r;
}

// what every power sees; then each power notes what it saw of foreign cities (unless just rebuilding a restored game)
export function updateSight(intel = true) {
  if (!fogRules()) return;
  const { W, H } = MAP, N = W * H;
  for (const F of GS.factions) {
    let g = SIGHT.grids[F.id];
    if (!g || g.length !== N) g = SIGHT.grids[F.id] = new Uint8Array(N);
    g.fill(0);
    const stamp = (x, y, R) => {
      const r = Math.ceil(R + 1);
      const x0 = Math.max(0, Math.round(x) - r), x1 = Math.min(W - 1, Math.round(x) + r);
      const y0 = Math.max(0, Math.round(y) - r), y1 = Math.min(H - 1, Math.round(y) + r);
      for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
        const v = clamp((R + 1 - Math.hypot(cx - x, cy - y)) / 2, 0, 1) * 255;
        const i = cy * W + cx;
        if (v > g[i]) g[i] = v;
      }
    };
    for (const c of MAP.cities) if (c.owner === F.id) stamp(c.x, c.y, (c.major ? SIGHT_R.major : SIGHT_R.town) + SIGHT_R.perWall * c.walls);
    for (const a of GS.armies) if (!a.dead && a.owner === F.id) stamp(a.x, a.y, sightRange(a));
    for (const f of GS.forts) if (!f.dead && f.owner === F.id) stamp(f.x, f.y, f.built >= 1 ? SIGHT_R.fort : SIGHT_R.fortBuilding);
    // intel: militia and garrison of the foreign cities in sight
    if (!F.alive || !intel) continue;
    F.intel = F.intel || {};
    for (const c of MAP.cities) {
      if (c.owner === F.id || g[c.cell] <= SEEN) continue;
      let gar = 0;
      if (c.owner !== NEUTRAL) for (const a of GS.armies) if (!a.dead && a.owner === c.owner && Math.abs(a.x - c.x) < 2.6 && Math.abs(a.y - c.y) < 2.6) gar += menOf(a.comp);
      F.intel[c.id] = { m: Math.round(c.militia), g: gar, t: Math.round(GS.time * 10) / 10 };
    }
  }
  SIGHT.version++;
}

// does power f see the cell at (x, y)?
export function sees(f, x, y) {
  if (!fogRules()) return true;
  const g = SIGHT.grids[f];
  if (!g) return true;
  return g[cellOf(clamp(x, 0, MAP.W - 1), clamp(y, 0, MAP.H - 1))] > SEEN;
}
export const knowsArmy = (f, a) => a.owner === f || sees(f, a.x, a.y);
// what power f believes defends city c: militia, garrison in men (null: the real armies are visible), seen right now?
export function cityEstimate(f, c) {
  if (c.owner === f || sees(f, c.x, c.y)) return { militia: c.militia, garrison: null, known: true };
  const I = GS.factions[f].intel && GS.factions[f].intel[c.id];
  const age = I ? GS.time - I.t : Infinity;
  if (age < INTEL_FRESH) return { militia: Math.min(c.militiaMax, I.m + c.militiaMax * 0.012 * age), garrison: I.g, known: false };
  return { militia: c.militiaMax, garrison: 0, known: false };
}

// what is drawn on screen: the player's view (or the followed power's in autoplay)
export const canSee = (x, y) => !SIGHT.on || sees(viewer(), x, y);
export const seesArmy = (a) => !SIGHT.on || a.owner === viewer() || canSee(a.x, a.y);
export const seesBattle = (B) => !SIGHT.on || B.sides.some((s) => s.faction === viewer()) || canSee(B.x, B.y);
export const seesCity = (c) => !SIGHT.on || c.owner === viewer() || canSee(c.x, c.y);
