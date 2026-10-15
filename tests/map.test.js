// Map generation is pure JavaScript (no three.js, no DOM), so it is tested directly in Node.
import { generateMap, MAP_GEN, N8 } from '../src/map/generate.js';
import { check } from './helpers.js';

export default async function map() {
  for (const seed of [1, 4242, 987654]) {
    const t0 = Date.now();
    const M = generateMap(seed);
    const again = generateMap(seed);
    check(JSON.stringify(M.cities) === JSON.stringify(again.cities) && M.landCount === again.landCount, `seed ${seed}: same seed, same map`);
    check(M.provinces.length >= 12, `seed ${seed}: ${M.provinces.length} provinces`);
    check(M.provinces.every((P) => P.major != null && M.cities[P.major] && M.cities[P.major].major), `seed ${seed}: every province has a major city`);
    check(M.cities.every((c) => c.prov >= 0 && M.provinces[c.prov] && (c.major ? M.provinces[c.prov].major === c.id : M.provinces[c.prov].small.includes(c.id))), `seed ${seed}: every city belongs to a province`);
    // marching: every city reachable over MAP.move, wide rivers closed except at bridges
    const ok = (i) => M.move[i] < Infinity, seen = new Uint8Array(M.W * M.H), q = [M.cities[0].cell];
    seen[q[0]] = 1;
    for (let h = 0; h < q.length; h++) {
      const c = q[h], cx = c % M.W, cy = (c / M.W) | 0;
      for (const [dx, dy] of N8) {
        const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= M.W || ny >= M.H) continue;
        const n = ny * M.W + nx;
        if (!seen[n] && ok(n) && (!dx || !dy || (ok(cy * M.W + nx) && ok(ny * M.W + cx)))) { seen[n] = 1; q.push(n); }
      }
    }
    check(M.cities.every((c) => seen[c.cell]), `seed ${seed}: every city can be reached by land`);
    let closed = 0, bridges = 0; for (let i = 0; i < M.W * M.H; i++) { if (M.river[i] && M.elev[i] >= 0 && !ok(i)) closed++; if (M.bridge[i]) bridges++; }
    check(closed > 0 && bridges > 0, `seed ${seed}: ${closed} river cells need a bridge, ${bridges} bridges`);
    console.log(`  seed ${seed}: ${M.W}x${M.H}, ${M.provinces.length} provinces, ${M.cities.length} cities, ${Date.now() - t0} ms`);
  }
  // continents the first version of the generator never finished (about one seed in twenty)
  const t0 = Date.now();
  for (const seed of [792233598, 300004973, 230000977]) generateMap(seed);
  check(Date.now() - t0 < 15000, `three continents that used to hang are made in ${Date.now() - t0} ms`);
  const v1 = generateMap(4242, 1), v2 = generateMap(4242);
  check(v1.gen === 1 && v2.gen === MAP_GEN && v1.landCount === v2.landCount, 'the first version of the generator is still there, for older saves');
}
