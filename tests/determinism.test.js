// The simulation must be reproducible: the same seed gives the same game. It draws only from its own generator
// (rnd in game/state.js, saved with the game), so effects and sounds, which use Math.random, cannot change it.
import { serve, launch, openGame, run, check } from './helpers.js';

const RUN = `([seed, steps, noise]) => {
  const T = window.__T; T.setNoRender(true);
  T.prepareCampaign(seed); T.setAuto(true); T.GS.speed = 0;
  T.GS.fog = true; T.GS.sightT = 0;   // every power under the fog: the sight grids are part of the simulation
  // in the noisy run, other code draws from Math.random at irregular moments, as sounds and effects do
  for (let i = 0; i < steps; i++) { T.simStep(0.1); if (noise) for (let k = (i * 7919) % 5; k > 0; k--) Math.random(); }
  const s = JSON.parse(JSON.stringify(T.serializeGame())); delete s.at; delete s.view;
  return JSON.stringify(s);
}`;

export default async function determinism() {
  const site = await serve();
  const browser = await launch();
  try {
    const out = [];
    for (const noise of [false, true]) {
      const { ctx, page, errors } = await openGame(browser, site.url);
      out.push(await run(page, RUN, [4242, 3000, noise]));
      if (errors.length) console.log('  page errors:', errors.slice(0, 3));
      await ctx.close();
    }
    check(out[0] === out[1], `same seed, same game after 5 minutes of autoplay under the fog, whatever else draws random numbers (${Math.round(out[0].length / 1024)} KB of state compared)`);
    // saved after 4 minutes and loaded again, the war must go on exactly as if it had never stopped: everything the
    // simulation keeps (random state, AI timers...) is in the save. (The fog's sight grids are rebuilt on load from
    // the armies' positions, so if this ever fails after a change to sight.js, look there first.)
    const { ctx, page } = await openGame(browser, site.url);
    const resumed = await run(page, `([seed, steps]) => {
      const T = window.__T; T.setNoRender(true);
      T.prepareCampaign(seed); T.setAuto(true); T.GS.speed = 0; T.GS.fog = true; T.GS.sightT = 0;
      for (let i = 0; i < 2400; i++) T.simStep(0.1);
      const mid = JSON.parse(JSON.stringify(T.serializeGame()));
      T.prepareCampaign(0, mid); T.setAuto(true); T.GS.speed = 0;
      for (let i = 2400; i < steps; i++) T.simStep(0.1);
      const s = JSON.parse(JSON.stringify(T.serializeGame())); delete s.at; delete s.view;
      return JSON.stringify(s);
    }`, [4242, 3000]);
    await ctx.close();
    check(resumed === out[0], 'saved after 4 minutes and loaded again, the war goes on exactly as if it had never stopped');
  } finally { await browser.close(); site.close(); }
}
