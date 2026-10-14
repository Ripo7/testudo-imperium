// Any of the four powers can be played, and autoplay is watched through the eyes of the power you follow.
import { serve, launch, run, check } from './helpers.js';

export default async function powers() {
  const site = await serve();
  const browser = await launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 760 } });
    const errors = [];
    const open = async () => {
      const pg = await ctx.newPage();
      pg.on('pageerror', (e) => errors.push(String(e)));
      pg.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      await pg.goto(site.url + '?test', { timeout: 120000 });
      await pg.waitForFunction(() => window.__T && window.__T.MAP, null, { timeout: 120000 });
      return pg;
    };
    // play Carthage
    let page = await open();
    await page.evaluate(() => document.querySelector('#powers [data-pick="1"]').click());
    check((await page.innerText('#startBtn')).includes('Carthage'), 'picking Carthage on the title screen');
    await page.evaluate(() => document.querySelector('#startBtn').click());
    await page.waitForFunction(() => window.__T.UI.mode === 'play');
    const st = await run(page, `() => {
      const T = window.__T, me = T.PLAYER;
      const a = T.GS.armies.find((x) => x.owner === me);
      T.UI.sel = [a]; T.renderPanel(true);
      return { me, isPlayer: T.GS.factions[me].isPlayer, others: T.GS.factions.filter((F) => F.isPlayer).length,
        crest: document.querySelector('#crest span').textContent, panel: document.getElementById('panel').innerText, fog: T.SIGHT.on };
    }`);
    check(st.me === 1 && st.isPlayer && st.others === 1, 'the player commands Carthage, and only Carthage');
    check(st.crest === 'CARTHAGO', `the crest shows Carthage (${st.crest})`);
    check(/Punic army/.test(st.panel) && /Shield wall/.test(st.panel), 'army panel: a Punic army with a shield wall stance');
    await page.evaluate(() => window.__T.saveGame());
    await page.close();
    page = await open();
    await page.evaluate(() => document.querySelector('#contBtn').click());
    await page.waitForFunction(() => window.__T.UI.mode === 'play');
    check(await page.evaluate(() => window.__T.PLAYER === 1 && window.__T.GS.factions[1].isPlayer), 'a saved Carthaginian campaign resumes as Carthage');
    await page.evaluate(() => localStorage.clear());
    await page.close();

    // autoplay under the fog: through the eyes of the followed power, then take command of it
    page = await open();
    await page.evaluate(() => document.querySelector('#autoBtn').click());
    await page.waitForFunction(() => window.__T.UI.mode === 'play');
    const au = await run(page, `() => {
      const T = window.__T;
      for (let i = 0; i < 3000; i++) T.simStep(0.1);
      const res = [];
      for (const f of [0, 2]) {
        T.UI.viewF = f; T.SIGHT.on = T.fogShown(); T.updateFogTexture();
        const hidden = T.GS.armies.filter((a) => !a.dead && !T.seesArmy(a)).length;
        res.push({ f, viewer: T.viewer(), hidden, ownHidden: T.GS.armies.filter((a) => !a.dead && a.owner === f && !T.seesArmy(a)).length });
      }
      return { on: T.SIGHT.on, fog: T.GS.fog, res };
    }`);
    check(au.on && au.fog, 'autoplay draws the fog');
    check(au.res.every((r) => r.viewer === r.f && r.hidden > 0 && r.ownHidden === 0), `the fog follows the chosen power (${au.res.map((r) => `${r.f}: ${r.hidden} hidden`).join(', ')})`);
    await page.evaluate(() => { window.__T.UI.viewF = 3; document.querySelector('#btnMenu').click(); });
    check((await page.innerText('#autoToggle')).includes('Egypt') || (await page.innerText('#autoToggle')).includes('no city'), 'the menu offers command of the followed power');
    await page.evaluate(() => document.querySelector('#autoToggle').click());
    const took = await page.evaluate(() => [window.__T.GS.auto, window.__T.PLAYER, window.__T.GS.factions[3].isPlayer]);
    check(took[0] === false && took[1] === 3 && took[2], 'taking command of Egypt from autoplay');
    check(!errors.length, `no script errors${errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''}`);
    await ctx.close();
  } finally { await browser.close(); site.close(); }
}
