// Smoke test: the game loads, a campaign plays, every panel renders, and nothing logs an error.
import { serve, launch, openGame, run, check } from './helpers.js';

export default async function smoke() {
  const site = await serve();
  const browser = await launch();
  try {
    for (const [label, opts] of [['desktop', {}], ['phone', { viewport: { width: 390, height: 844 }, mobile: true }]]) {
      const { ctx, page, errors } = await openGame(browser, site.url, opts);
      check(await page.isVisible('#title'), `[${label}] title screen shown`);
      await page.evaluate(() => document.querySelector('#startBtn').click());
      await page.waitForFunction(() => window.__T.UI.mode === 'play');
      const r = await run(page, `() => {
        const T = window.__T, rome = T.GS.factions[0];
        rome.isPlayer = false;
        for (let i = 0; i < 4000 && !T.GS.over; i++) T.simStep(0.1);
        rome.isPlayer = true;
        let panels = 0;
        for (const c of T.MAP.cities) { T.cityPanel(c); panels++; }
        for (const P of T.MAP.provinces) { T.provPanel(P); panels++; }
        for (const F of T.GS.factions) if (F.id !== 0) { T.dipPanel(F.id); panels++; }
        for (const a of T.GS.armies) { if (a.owner === 0) T.myArmyPanel([a]); else T.enemyArmyPanel(a); panels++; }
        for (const B of T.GS.battles) { T.battlePanel(B); panels++; }
        T.updateHUD(); T.renderPanel(true);
        return { time: Math.round(T.GS.time), over: T.GS.over, panels, wars: Object.values(T.GS.rel).filter((R) => R.war).length, battles: T.GS.battles.length };
      }`);
      console.log(`  ${label}:`, r);
      check(r.time >= 390 || !!r.over, `[${label}] campaign simulated (${r.time}s)`);
      check(r.panels > 60, `[${label}] every panel renders (${r.panels})`);
      await page.waitForTimeout(800);   // a few real frames with the renderer on
      check(!errors.length, `[${label}] no script errors${errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''}`);
      await ctx.close();
    }
  } finally { await browser.close(); site.close(); }
}
