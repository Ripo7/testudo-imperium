// Runs AI-vs-AI wars headless, several browser pages in parallel, and collects one record per war.
import { launch, openGame, run } from '../tests/helpers.js';

const pct = (a, q) => a[Math.min(a.length - 1, Math.floor(a.length * q))];
export const quantiles = (xs) => { const a = [...xs].sort((x, y) => x - y); return { p10: pct(a, 0.1), p50: pct(a, 0.5), p90: pct(a, 0.9), max: a[a.length - 1] }; };
export const NAMES = ['Rome', 'Carthage', 'Gaul', 'Egypt'];

/**
 * @param url      page to open (served build)
 * @param n        number of wars
 * @param workers  pages running at once
 * @param fn       source of an async function (seed) => record, run inside the page
 */
export async function runWars({ url, n, workers = 3, fn, seed0 = Date.now() % 100000, onResult }) {
  const browser = await launch();
  const results = [];
  let next = 0;
  const worker = async () => {
    const { ctx, page, errors } = await openGame(browser, url, { viewport: { width: 640, height: 400 } });
    while (next < n) {
      const k = next++;
      const seed = seed0 + k * 7919;
      const t0 = Date.now();
      const r = await run(page, fn, seed);
      r.seed = seed; r.wall = (Date.now() - t0) / 1000;
      results.push(r);
      if (onResult) onResult(r, results.length, n);
    }
    if (errors.length) console.log('page errors:', errors.slice(0, 3));
    await ctx.close();
  };
  try { await Promise.all(Array.from({ length: Math.min(workers, n) }, worker)); }
  finally { await browser.close(); }
  return results;
}
