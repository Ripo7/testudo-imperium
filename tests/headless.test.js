// Headless: the simulation runs in plain Node (no browser, no screen), and a war played there is exactly the war
// the browser plays from the same seed. The tuning tools rely on both.
import { serve, launch, openGame, run, check } from './helpers.js';
import { newWar, playSteps, stateOf } from '../tools/headless.js';

const SEEDS = [4242, 90210];
const STEPS = 6000;   // ten minutes of war

export default async function headless() {
  const site = await serve();
  const browser = await launch();
  try {
    const { ctx, page, errors } = await openGame(browser, site.url, { viewport: { width: 640, height: 400 } });
    for (const seed of SEEDS) {
      const t0 = Date.now();
      newWar(seed); playSteps(STEPS);
      const node = JSON.stringify(stateOf()), tNode = (Date.now() - t0) / 1000;
      const t1 = Date.now();
      const web = await run(page, `([seed, n]) => {
        const T = window.__T; T.setNoRender(true);
        T.prepareCampaign(seed); T.setAuto(true); T.GS.speed = 0; T.GS.fog = true; T.GS.sightT = 0;
        for (let i = 0; i < n && !T.GS.over; i++) T.simStep(0.1);
        const s = JSON.parse(JSON.stringify(T.serializeGame())); delete s.at; delete s.view; delete s.gs.speed; delete s.tb;
        return JSON.stringify(s);
      }`, [seed, STEPS]);
      const tWeb = (Date.now() - t1) / 1000;
      let at = -1;
      if (node !== web) for (let i = 0; i < Math.max(node.length, web.length); i++) if (node[i] !== web[i]) { at = i; break; }
      check(node === web, `seed ${seed}: ten minutes of war in Node match the browser exactly (${tNode.toFixed(1)} s in Node, ${tWeb.toFixed(1)} s in the browser)${at < 0 ? '' : `; first difference: …${node.slice(Math.max(0, at - 80), at + 40)}… vs …${web.slice(Math.max(0, at - 80), at + 40)}…`}`);
    }
    check(!errors.length, `no script errors${errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''}`);
    await ctx.close();
  } finally { await browser.close(); site.close(); }
}
