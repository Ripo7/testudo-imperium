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
  const running = new Map();
  let next = 0;
  const worker = async () => {
    let G = await openGame(browser, url, { viewport: { width: 640, height: 400 } });
    while (next < n) {
      const k = next++;
      const seed = seed0 + k * 7919;
      const t0 = Date.now();
      running.set(seed, t0);
      try {
        const r = await run(G.page, fn, seed);
        r.seed = seed; r.wall = (Date.now() - t0) / 1000;
        results.push(r);
        if (onResult) onResult(r, results.length, n);
        running.delete(seed);
      } catch (e) {
        running.delete(seed);
        // a crashed or stuck page shouldn't sink the whole batch: note it and carry on in a fresh page
        console.log(`war with seed ${seed} failed: ${String(e.message || e).split('\n')[0]}`);
        await G.ctx.close().catch(() => {});
        G = await openGame(browser, url, { viewport: { width: 640, height: 400 } });
      }
    }
    if (G.errors.length) console.log('page errors:', G.errors.slice(0, 3));
    await G.ctx.close();
  };
  // a war taking more than two minutes of real time is worth knowing about
  const watchdog = setInterval(() => { for (const [seed, t0] of running) if (Date.now() - t0 > 120000) console.log(`still running: war with seed ${seed} (${Math.round((Date.now() - t0) / 1000)} s)`); }, 60000);
  try { await Promise.all(Array.from({ length: Math.min(workers, n) }, worker)); }
  finally { clearInterval(watchdog); await browser.close(); }
  return results;
}
