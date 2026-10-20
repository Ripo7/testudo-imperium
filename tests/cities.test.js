// City generator (plain Node, a few seconds): the same city always comes out the same, every culture builds a town
// inside its walls, each improvement raises its landmark and only takes the ground of the houses it replaces, the
// far version is lighter, and every style of wall stands.
import { check } from './helpers.js';
import { CULTURES, LANDMARKS, cityParts, planCity, wallParts } from '../src/render/citygen.js';
import { merge } from '../src/render/geom.js';
import { distSeg } from '../src/render/city/kit.js';

const SIZES = { town: { major: false, capital: false, R: 0.95 }, city: { major: true, capital: false, R: 1.6 }, capital: { major: true, capital: true, R: 1.6 } };
const spec = (culture, size, seed, imps = [], port = false) => {
  const a0 = (seed * 2.399) % 6.283, S = SIZES[size], n = S.major ? 3 : 2;
  return { seed, R: S.R, gates: Array.from({ length: n }, (_, k) => a0 + k * 6.283 / n + (k ? 0.3 : 0)), major: S.major, capital: S.capital, port, portAng: port ? a0 + 2.5 : null, culture, imps };
};
const tris = (plan, far) => merge(cityParts(plan, far)).attributes.position.count / 3;
const HOUSES = ['house', 'domus', 'insula', 'shops', 'tall', 'court', 'round', 'long'];

export default async function cities() {
  const t0 = performance.now();
  // the same city twice
  const s0 = spec('punic', 'capital', 4242, ['forum', 'temple'], true);
  const g1 = merge(cityParts(planCity(s0))), g2 = merge(cityParts(planCity(s0)));
  check(JSON.stringify(planCity(s0)) === JSON.stringify(planCity(s0)) && g1.attributes.position.array.every((v, i) => v === g2.attributes.position.array[i]), 'the same city is planned and built the same every time');

  const bad = [], counts = {}, missing = [], lost = [], heavy = [];
  let nan = false;
  for (const culture of CULTURES) for (const size of Object.keys(SIZES)) for (let seed = 1; seed <= 6; seed++) {
    const bare = planCity(spec(culture, size, seed * 97));
    const all = planCity(spec(culture, size, seed * 97, ['forum', 'temple', 'barracks', 'farm']));
    const houses = bare.items.filter((it) => HOUSES.includes(it.kind));
    counts[`${culture} ${size}`] = Math.min(counts[`${culture} ${size}`] ?? 1e9, houses.length);
    const R = SIZES[size].R;
    for (const it of all.items) if (!(Math.hypot(it.x, it.z) < R) || !Number.isFinite(it.rot)) bad.push(`${culture} ${size} ${it.kind}`);
    // every improvement's landmark, with the Roman temple standing in its forum
    for (const [imp, kinds] of Object.entries(LANDMARKS)) {
      const ok = all.items.some((it) => kinds.includes(it.kind) || (imp === 'temple' && it.kind === 'forum' && it.temple));
      if (!ok) missing.push(`${culture} ${size} #${seed} ${imp}`);
    }
    // building only takes the ground of the houses it replaces (a town has room for one improvement, a city for two)
    const key = (it) => `${it.kind} ${it.x.toFixed(5)} ${it.z.toFixed(5)} ${it.seed}`;
    const before = new Set(houses.map(key));
    for (const plan of [all, planCity(spec(culture, size, seed * 97, size === 'town' ? ['forum'] : ['forum', 'temple']))]) {
      const after = plan.items.filter((it) => HOUSES.includes(it.kind)).map(key), kept = after.filter((k) => before.has(k)).length;
      if (kept !== after.length || (plan !== all && kept < houses.length * 0.6)) lost.push(`${culture} ${size} #${seed}: ${kept}/${houses.length} kept, ${after.length - kept} new`);
    }
    if (seed === 1) {
      const near = tris(all, false), far = tris(all, true);
      if (!(far < near * (culture === 'roman' ? 0.95 : 0.75))) heavy.push(`${culture} ${size} ${far}/${near}`);
      const pos = merge(cityParts(all)).attributes.position.array;
      if (pos.some((v) => !Number.isFinite(v))) nan = true;
    }
  }
  check(!bad.length, `every building stands inside its walls${bad.length ? ': ' + bad.slice(0, 4).join(', ') : ''}`);
  check(Object.entries(counts).every(([k, n]) => n >= (k.endsWith('town') ? 12 : 40)), `every culture fills its towns and cities with houses (fewest: ${Object.entries(counts).map(([k, n]) => `${k} ${n}`).join(', ')})`);
  check(missing.length <= 2, `each improvement raises its landmark (${72 * 4 - missing.length} of ${72 * 4}${missing.length ? '; missing ' + missing.join(', ') : ''})`);
  check(!lost.length, `a new landmark only replaces the houses on its ground${lost.length ? ': ' + lost.slice(0, 4).join('; ') : ''}`);
  check(!heavy.length && !nan, `the far version is lighter${heavy.length ? ': ' + heavy.join(', ') : ''}${nan ? ' (and a position is not a number)' : ''}`);
  // a river through the town: the houses keep off it, its crossings get bridges, and the landmarks still find room
  let wetHouses = 0, bridges = 0, rivers = 0, placed = 0, wanted = 0;
  for (const culture of CULTURES) for (const size of ['town', 'city']) for (let seed = 1; seed <= 6; seed++) {
    const S = spec(culture, size, seed * 53, size === 'town' ? [['forum'], ['temple'], ['barracks'], ['farm']][seed % 4] : [['forum', 'temple'], ['barracks', 'farm']][seed % 2]);
    const L = S.R + 0.5, ang = seed * 1.3, off = ((seed * 0.37) % 1 - 0.5) * S.R;
    const p = (t) => { const x = -L + 2 * L * t, y = off + 0.2 * Math.sin(t * 3 + seed); return [x * Math.cos(ang) - y * Math.sin(ang), x * Math.sin(ang) + y * Math.cos(ang)]; };
    S.water = Array.from({ length: 12 }, (_, k) => ({ a: p(k / 12), b: p((k + 1) / 12), w: 0.22 }));
    const plan = planCity(S);
    rivers++;
    for (const it of plan.items) if (HOUSES.includes(it.kind) && S.water.some((W) => distSeg([it.x, it.z], W.a, W.b) < W.w + 0.02)) wetHouses++;
    if (plan.items.some((it) => it.kind === 'bridge')) bridges++;
    for (const imp of S.imps) { wanted++; if (plan.items.some((it) => LANDMARKS[imp].includes(it.kind) || (imp === 'temple' && it.kind === 'forum' && it.temple))) placed++; }
  }
  check(!wetHouses && bridges >= rivers * 0.8 && placed >= wanted * 0.97, `with a river through: no house in the water (${wetHouses}), bridges in ${bridges} of ${rivers} towns, ${placed} of ${wanted} landmarks placed`);
  // capitals: the amphitheatre, the citadel and the war harbour, the chief's hall on its mound, the great temple and lighthouse
  const capKinds = Object.fromEntries(CULTURES.map((c) => [c, new Set(planCity(spec(c, 'capital', 5, ['forum', 'temple'], true)).items.map((it) => it.kind))]));
  check(capKinds.roman.has('amphitheatre') && capKinds.punic.has('byrsa') && capKinds.punic.has('cothon') && capKinds.gaul.has('greatHall') && capKinds.egypt.has('greatTemple'), 'each capital has its own landmarks');
  // walls of every style and level
  const walls = [];
  for (const culture of CULTURES) for (const size of ['town', 'city']) for (const level of [1, 2, 3]) {
    const w = wallParts(spec(culture, size, 11), level);
    const pos = merge(w.parts).attributes.position.array;
    if (!w.parts.length || (level >= 2 && w.towerTops.length < 2) || pos.some((v) => !Number.isFinite(v))) walls.push(`${culture} ${size} ${level}`);
  }
  check(!walls.length, `walls of every culture at every level, with towers for the banners${walls.length ? ': ' + walls.join(', ') : ''}`);
  const ms = performance.now() - t0;
  check(ms < 20000, `generated in ${(ms / 1000).toFixed(1)} s`);
}
