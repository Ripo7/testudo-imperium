import { cellOf, GS, MAP, menOf } from './state.js';
import { clamp } from '../core/util.js';
import { BIOME } from '../map/generate.js';
import { sigOf } from './data.js';
import { ME, UI } from '../ui/state.js';

/* =========================================================
   Fog of war: what Rome can see
   Cities, armies and forts see the land around them; cavalry scouts and
   high ground see further. Outside that, enemy armies and battles are hidden
   and the defenders of a city are unknown. The map itself is always known.
   The AI is not limited by the fog.
   ========================================================= */
export const SIGHT_R = { major: 9, town: 6.5, perWall: 0.6, army: 6, scouts: 3, high: 1.5, fort: 8, fortBuilding: 4 };
// grid[i]: 0 (unseen) .. 255 (in plain sight), soft at the edges so the fog can be drawn smoothly
export const SIGHT = { on: false, grid: null, version: 0 };
const SEEN = 90;

export const fogActive = () => !!(MAP && GS.fog && !GS.auto && UI.mode === 'play');

export function sightRange(a) {
  const men = menOf(a.comp), riders = a.comp.cav + (sigOf(a.owner).mounted ? a.comp.leg : 0);
  let r = SIGHT_R.army + (men > 0 && riders / men >= 0.25 ? SIGHT_R.scouts : 0);
  const b = MAP.biome[cellOf(a.x, a.y)];
  if (b === BIOME.HILLS || b === BIOME.MOUNTAIN) r += SIGHT_R.high;
  return r;
}

export function updateSight() {
  SIGHT.on = fogActive();
  if (!SIGHT.on) return;
  const { W, H } = MAP, N = W * H;
  if (!SIGHT.grid || SIGHT.grid.length !== N) SIGHT.grid = new Uint8Array(N);
  const g = SIGHT.grid;
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
  for (const c of MAP.cities) if (c.owner === ME) stamp(c.x, c.y, (c.major ? SIGHT_R.major : SIGHT_R.town) + SIGHT_R.perWall * c.walls);
  for (const a of GS.armies) if (!a.dead && a.owner === ME) stamp(a.x, a.y, sightRange(a));
  for (const f of GS.forts) if (!f.dead && f.owner === ME) stamp(f.x, f.y, f.built >= 1 ? SIGHT_R.fort : SIGHT_R.fortBuilding);
  SIGHT.version++;
}

export function canSee(x, y) {
  if (!SIGHT.on || !SIGHT.grid) return true;
  const i = cellOf(clamp(x, 0, MAP.W - 1), clamp(y, 0, MAP.H - 1));
  return SIGHT.grid[i] > SEEN;
}
export const seesArmy = (a) => !SIGHT.on || a.owner === ME || canSee(a.x, a.y);
export const seesBattle = (B) => !SIGHT.on || B.sides.some((s) => s.faction === ME) || canSee(B.x, B.y);
export const seesCity = (c) => !SIGHT.on || c.owner === ME || canSee(c.x, c.y);
