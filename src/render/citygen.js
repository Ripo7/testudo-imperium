import { rng32 } from '../map/generate.js';
import { box, merge } from './geom.js';
import { FROND, PANE, TREE_KINDS, bridge, facing, frame, tree } from './city/kit.js';
import { ROMAN_BUILD, ROMAN_PAL, romanPlan, romanWalls } from './city/roman.js';
import { PUNIC_BUILD, PUNIC_PAL, punicPlan, punicWalls } from './city/punic.js';
import { GAUL_BUILD, GAUL_PAL, gaulPlan, gaulWalls } from './city/gaul.js';
import { EGYPT_BUILD, EGYPT_PAL, egyptPlan, egyptWalls } from './city/egypt.js';

/* =========================================================
   City generator
   A city is laid out the way procedural city tools do it, at the scale of a town: streets first (from the gates the
   map's roads arrive at), then blocks and plots, then a building on each plot from its culture's rules (footprint,
   walls, roof, details), and the landmarks its improvements have built. Each culture's rules live in render/city/
   (kit.js holds what they share). Everything comes from the city's own seed, so a city always looks the same, and
   a new improvement only replaces the houses on its ground. Nothing here touches the simulation.
   planCity() returns the plan, cityParts() / cityGeometry() its geometry, wallParts() the walls.
   ========================================================= */
export const CULTURES = ['roman', 'punic', 'gaul', 'egypt'];
// the style of the land a city stands in: the culture of the power that starts nearest to it (FACTIONS order)
export const CULTURE_OF_POWER = ['roman', 'punic', 'gaul', 'egypt'];
export let STYLES = null;
// a culture's rules: planner, builders, palette, walls (filled on first use)
export function styleOf(culture) {
  if (!STYLES) {
    STYLES = {
      roman: { plan: romanPlan, build: ROMAN_BUILD, pal: ROMAN_PAL, walls: romanWalls },
      punic: { plan: punicPlan, build: PUNIC_BUILD, pal: PUNIC_PAL, walls: punicWalls },
      gaul: { plan: gaulPlan, build: GAUL_BUILD, pal: GAUL_PAL, walls: gaulWalls },
      egypt: { plan: egyptPlan, build: EGYPT_BUILD, pal: EGYPT_PAL, walls: egyptWalls },
    };
  }
  return STYLES[culture] || STYLES.roman;
}

// the landmark each improvement raises, whatever the culture (a Roman forum holds the temple once both are built; an
// Egyptian capital always has its great temple)
export const LANDMARKS = {
  forum: ['forum', 'agora', 'market'],
  temple: ['temple', 'pylonTemple', 'greatTemple', 'sanctuary'],
  barracks: ['castra', 'stables', 'garrison', 'warhall'],
  farm: ['horrea', 'warehouse', 'granary', 'farmyard'],
};

/**
 * spec: { seed, R, gates (angles the roads arrive from), major, capital, port, portAng (toward the sea), culture,
 *         imps (improvements built), water (the river's stretches through it: [{ a: [u, v], b: [u, v], w (half width) }]) }
 * returns { spec, streets: [{ a, b, w, main }], items: [{ kind, x, z, rot, w, l, seed, ... }], flagAt: [u, y, v] }
 */
export function planCity(spec) {
  const s = { ...spec, imps: spec.imps || [] };
  if (!s.gates || !s.gates.length) s.gates = [rng32((s.seed >>> 0) * 31 + 7)() * Math.PI * 2];
  const plan = { spec: s, streets: [], items: [], flagAt: [0, 0.4, 0] };
  styleOf(s.culture).plan(plan);
  return plan;
}

/* ---------- the far version: the same plan without the small things ---------- */
// seen from afar a city keeps its buildings, roofs, landmarks and trees, and loses doors, windows, posts, jars and the
// like: anything whose size is under FAR_MIN
export const FAR_MIN = 0.04;
export function isSmall(geo, scale) {
  if (geo === PANE) return true;
  if (geo === FROND) return false;                     // palms keep their fronds (two faces each)
  const s = scale || [1, 1, 1];
  if (geo.dims) { const d = geo.dims; return Math.hypot(d[0] * s[0], d[1] * s[1], d[2] * s[2]) / 2 < FAR_MIN; }
  if (!geo.boundingSphere) geo.computeBoundingSphere();
  return geo.boundingSphere.radius * Math.max(s[0], s[1], s[2]) < FAR_MIN;
}

/** The parts of every street and building of a plan, ready to merge; far: the light version for distant views. */
export function cityParts(plan, far = false) {
  const { build, pal } = styleOf(plan.spec.culture);
  const parts = [];
  for (const S of plan.streets) {
    if (far && !S.main && S.w < 0.05) continue;
    const dx = S.b[0] - S.a[0], dz = S.b[1] - S.a[1], len = Math.hypot(dx, dz);
    if (len < 0.01) continue;
    parts.push({ geo: box(S.w, 0.006, len + S.w * 0.5), color: S.main ? pal.main : pal.street, pos: [(S.a[0] + S.b[0]) / 2, S.main ? 0.005 : 0.004, (S.a[1] + S.b[1]) / 2], rot: [0, facing(dx, dz), 0] });
  }
  for (const it of plan.items) {
    const rnd = rng32((it.seed || 1) >>> 0);
    const near = frame(parts, it.x, it.z, it.rot);
    let add = near;
    if (far) { add = (geo, color, lx, ly, lz, extra = {}) => { if (!isSmall(geo, extra.scale)) near(geo, color, lx, ly, lz, extra); }; add.far = true; }
    if (TREE_KINDS.includes(it.kind)) { tree(add, 0, 0, rnd, it.kind); continue; }
    const f = build[it.kind] || (it.kind === 'bridge' ? bridge : null);
    if (f) f(add, it, rnd, pal);
  }
  return parts;
}

/** The merged, shaded geometry of a city's streets and buildings. */
export function cityGeometry(plan, far = false) {
  const g = merge(cityParts(plan, far));
  const p = g.attributes.position, c = g.attributes.color;
  for (let i = 0; i < p.count; i++) {                    // painted light: darker toward the ground
    const t = Math.min(1, Math.max(0, p.getY(i) / 0.35)), f = 0.74 + (1.06 - 0.74) * t * t * (3 - 2 * t);
    c.setXYZ(i, c.getX(i) * f, c.getY(i) * f, c.getZ(i) * f);
  }
  return g;
}

/** A city's walls at a level (0 none, 1 to 3) in its culture's style, gates where the roads arrive: { parts, towerTops }. */
export function wallParts(spec, level) {
  return styleOf(spec.culture).walls({ ...spec, gates: spec.gates && spec.gates.length ? spec.gates : [0] }, level);
}
