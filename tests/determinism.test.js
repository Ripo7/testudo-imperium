// The simulation must be reproducible: the same seed and the same random numbers give the same game.
// (Sounds and the wall clock are neutralised: sound effects draw random numbers and depend on the camera.)
import { serve, launch, openGame, run, check, SEED_RANDOM } from './helpers.js';

const RUN = `([seed, steps]) => {
  const T = window.__T; T.setNoRender(true);
  let clock = 1e6; performance.now = () => (clock += 0.001);
  for (const k of Object.keys(T.Sfx)) if (typeof T.Sfx[k] === 'function') T.Sfx[k] = () => {};
  (${SEED_RANDOM})(seed);
  T.prepareCampaign(seed); T.setAuto(true); T.GS.speed = 0;
  T.GS.fog = true; T.GS.sightT = 0;   // every power under the fog: the sight grids are part of the simulation
  for (let i = 0; i < steps; i++) T.simStep(0.1);
  const s = JSON.parse(JSON.stringify(T.serializeGame())); delete s.at;
  return JSON.stringify(s);
}`;

export default async function determinism() {
  const site = await serve();
  const browser = await launch();
  try {
    const out = [];
    for (let k = 0; k < 2; k++) {
      const { ctx, page, errors } = await openGame(browser, site.url);
      out.push(await run(page, RUN, [4242, 3000]));
      if (errors.length) console.log('  page errors:', errors.slice(0, 3));
      await ctx.close();
    }
    check(out[0] === out[1], `same seed, same game after 5 minutes of autoplay under the fog (${Math.round(out[0].length / 1024)} KB of state compared)`);
  } finally { await browser.close(); site.close(); }
}
