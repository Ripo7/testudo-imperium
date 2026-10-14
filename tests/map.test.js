// Map generation is pure JavaScript (no three.js, no DOM), so it is tested directly in Node.
import { generateMap } from '../src/map/generate.js';
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
    console.log(`  seed ${seed}: ${M.W}x${M.H}, ${M.provinces.length} provinces, ${M.cities.length} cities, ${Date.now() - t0} ms`);
  }
}
