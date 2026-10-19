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
        for (const tab of ['empire', 'wars', 'chron']) { T.UI.chronF = 'all'; if (T.overviewPanel(tab).length > 200) panels++; }
        for (const f of ['war', 'bat', 'city']) { T.UI.chronF = f; T.overviewPanel('chron'); }
        const alerts = T.GS.factions.map((F) => T.computeAlerts(F.id).length);
        const record = { events: T.GS.chron.length, battles: T.GS.chron.filter((e) => e.k === 'bat').length, samples: T.GS.hist.length, raised: T.GS.fstats.reduce((m, s) => m + s.raised, 0) };
        T.updateHUD(); T.renderPanel(true);
        // fog of war (on by default when playing Rome): some enemies hidden, unseen cities' defenders unknown
        T.updateSight(); T.SIGHT.on = T.fogShown();
        const enemies = T.GS.armies.filter((a) => !a.dead && a.owner !== 0), hidden = enemies.filter((a) => !T.seesArmy(a)).length;
        const unseen = T.MAP.cities.find((c) => c.owner !== 0 && !T.seesCity(c));
        const fog = { on: T.SIGHT.on, enemies: enemies.length, hidden, unknownCity: !!unseen && T.cityPanel(unseen).includes('Out of sight') };
        return { time: Math.round(T.GS.time), over: T.GS.over, fog, panels, alerts, record, wars: Object.values(T.GS.rel).filter((R) => R.war).length, battles: T.GS.battles.length };
      }`);
      console.log(`  ${label} (map seed ${await page.evaluate(() => window.__T.MAP.seed)}):`, r);
      check(r.time >= 390 || !!r.over, `[${label}] campaign simulated (${r.time}s)`);
      check(r.panels > 60, `[${label}] every panel renders (${r.panels})`);
      check(r.fog.on && r.fog.hidden > 0 && r.fog.unknownCity, `[${label}] fog of war hides ${r.fog.hidden} of ${r.fog.enemies} enemy armies and unseen defenders`);
      check(r.record.battles > 5 && r.record.samples >= Math.floor(r.time / 10) && r.record.raised > 0, `[${label}] the war is recorded (${r.record.events} events, ${r.record.samples} samples)`);
      await page.waitForTimeout(800);   // a few real frames with the renderer on
      // close-up models: an army near the camera is drawn with the detailed spearmen, and with the light ones from afar
      await page.waitForFunction(() => Object.keys(window.__T.MODEL_URLS).every((k) => window.__T.MODELS[k]), null, { timeout: 60000 });
      const lod = await page.evaluate(() => {
        const T = window.__T, a = T.GS.armies.find((x) => !x.dead && x.comp.spear > 0 && T.seesArmy(x));
        if (!a) return null;
        const w = T.cellToWorld(a.x, a.y), cam = { ...T.CAM };
        const look = (d) => { T.CAM.x = T.CAM.tx = w.x; T.CAM.z = T.CAM.tz = w.z; T.CAM.d = T.CAM.td = d; T.applyCamera(); T.updateCrowds(T.GS.time); return { near: T.crowdNear.spear.count, far: T.crowd.spear.count }; };
        const close = look(8), high = look(120);
        Object.assign(T.CAM, cam); T.applyCamera();
        return { tris: Object.entries(T.MODELS).map(([k, g]) => `${k} ${g.index.count / 3}`).join(', '), close, high };
      });
      check(lod && lod.close.near > 0 && lod.high.near === 0 && lod.high.far >= lod.close.near, `[${label}] close-up models loaded (${lod && lod.tris} triangles); spearmen near the camera use theirs (${lod && lod.close.near}) and the light ones from high up`);
      const view = await page.evaluate(() => {
        const vis = (id) => { const el = document.getElementById(id); return !!el && el.offsetParent !== null && getComputedStyle(el).display !== 'none'; };
        document.getElementById('btnView').click();
        // the tool buttons stay: under the standings on a desktop, in the dock on a phone
        const hidden = { stand: vis('standRows'), tools: vis('tools') || vis('dock'), log: vis('log'), hint: vis('hintbar') };
        document.getElementById('btnView').click();
        return { hidden, back: vis('standRows'), stored: localStorage.getItem('testudo.mapView') };
      });
      check(!view.hidden.stand && view.hidden.tools && !view.hidden.log && !view.hidden.hint && view.back && view.stored === 'false', `[${label}] the eye hides the panels (keeping the tool buttons) and brings them back`);
      // the end of the war: the report with its charts, ledger, wars and key moments
      await page.evaluate(() => { const T = window.__T; T.setNoRender(true); if (!T.GS.over) T.endWar('win', T.PLAYER); });   // the renderer off: software WebGL frames are slow
      await page.waitForFunction(() => !document.getElementById('over').classList.contains('hidden'), null, { timeout: 60000, polling: 250 });
      const rep = await page.evaluate(() => { const R = document.getElementById('report'); return { charts: R.querySelectorAll('svg.ch').length, lines: R.querySelectorAll('svg.ch .ln').length, ledger: R.querySelectorAll('.rep-ledger tbody tr').length, econ: R.querySelectorAll('.ledger.econ tbody tr:not(.grp)').length, earned: [...R.querySelectorAll('.ledger.econ tr.total td')].map((td) => parseInt(td.textContent.replace(/,/g, ''), 10)), moments: R.querySelectorAll('.rep-moments .ce').length, width: R.scrollWidth <= R.clientWidth + 1,
        spill: [...R.querySelectorAll('*')].filter((el) => el.getBoundingClientRect().right > R.getBoundingClientRect().right + 1 && !el.closest('.tblwrap')).slice(0, 3).map((el) => `${el.tagName}.${el.getAttribute('class') || ''} ${(el.textContent || '').slice(0, 30)}`) }; });
      check(rep.charts === 3 && rep.lines >= 9 && rep.ledger > 10 && rep.moments > 3 && rep.width, `[${label}] end-of-war report: ${rep.charts} charts, ${rep.ledger} ledger rows, ${rep.moments} key moments, fits the screen${rep.width ? '' : ` (it does not: ${rep.spill.join(' | ') || 'nothing found'})`}`);
      check(rep.econ >= 18 && rep.earned.length === 4 && rep.earned.every((v) => v > 1000), `[${label}] economy in the report: ${rep.econ} rows, earned ${rep.earned.join(', ')}`);
      check(!errors.length, `[${label}] no script errors${errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''}`);
      await ctx.close();
    }
  } finally { await browser.close(); site.close(); }
}
