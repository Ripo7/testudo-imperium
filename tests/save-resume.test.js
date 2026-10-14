// Save & resume: play forward, close the tab, reopen, and check the restored game is identical to the save.
import { serve, launch, run, check } from './helpers.js';

const SIM = `async ([secs, needBattle]) => {
  const T = window.__T; T.GS.speed = 0;
  const rome = T.GS.factions[0], wasPlayer = rome.isPlayer; rome.isPlayer = false;   // the AI steers Rome while we fast-forward
  let t = 0;
  while (t < secs || (needBattle && !T.GS.battles.some((b) => !b.done) && t < secs + 400)) {
    for (let i = 0; i < 50; i++) T.simStep(0.1);
    t += 5;
    if (T.GS.over) break;
    await new Promise((r) => setTimeout(r, 0));
  }
  rome.isPlayer = wasPlayer;
  return { time: Math.round(T.GS.time), armies: T.GS.armies.length, battles: T.GS.battles.filter((b) => !b.done).length, over: T.GS.over };
}`;
// key order doesn't matter (the restored view object is built in a different order)
const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
const strip = (s) => { const c = { ...s }; delete c.at; return JSON.stringify(canon(c)); };

async function scenario(browser, url, modeBtn, label) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  const open = async () => {
    const pg = await ctx.newPage();
    pg.on('pageerror', (e) => errors.push(String(e)));
    pg.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await pg.goto(url + '?test', { timeout: 120000 });
    await pg.waitForFunction(() => window.__T && window.__T.MAP, null, { timeout: 120000 });
    await pg.waitForTimeout(200);
    return pg;
  };
  const saved = (pg) => pg.evaluate(() => JSON.parse(localStorage.getItem('testudo.save.v1') || 'null'));
  const click = (pg, sel) => pg.evaluate((s) => document.querySelector(s).click(), sel);
  const T = (pg, expr) => pg.evaluate(expr);

  let page = await open();
  check(await page.isVisible('#title') && !(await page.isVisible('#contBtn')), `[${label}] fresh load: title shown, no Continue`);
  check((await saved(page)) === null, `[${label}] fresh load: no save yet`);

  await click(page, modeBtn); await page.waitForTimeout(300);
  check(await T(page, () => window.__T.UI.mode) === 'play', `[${label}] campaign started`);
  check((await saved(page)) !== null, `[${label}] saved on start`);

  console.log('  simulated to', await run(page, SIM, [400, true]));
  await T(page, () => window.__T.saveGame());
  const s1 = await saved(page);
  console.log(`  save size ${Math.round(JSON.stringify(s1).length / 1024)} KB, ${s1.armies.length} armies, ${s1.battles.length} live battles`);

  await page.close();
  page = await open();
  check(await page.isVisible('#contBtn'), `[${label}] reopened: Continue shown`);
  const s2 = await T(page, () => JSON.parse(JSON.stringify(window.__T.serializeGame())));
  const same = strip(s1) === strip(s2);
  if (!same) for (const k of Object.keys(s1)) if (k !== 'at' && JSON.stringify(canon(s1[k])) !== JSON.stringify(canon(s2[k]))) console.log('   differs:', k);
  check(same, `[${label}] restored state matches the save exactly`);

  await click(page, '#contBtn'); await page.waitForTimeout(300);
  const st2 = await T(page, () => [window.__T.UI.mode, document.getElementById('hud').className, window.__T.GS.speed]);
  check(st2[0] === 'play' && !st2[1].includes('hidden') && st2[2] > 0, `[${label}] Continue resumes play`);
  check(Math.abs((await T(page, () => window.__T.GS.time)) - s1.gs.time) < 1, `[${label}] clock carried over`);
  console.log('  played on to', await run(page, SIM, [120, false]));

  await T(page, () => { window.__T.GS.speed = 1; });
  await click(page, '#btnMenu'); await page.waitForTimeout(100);
  await click(page, '#quitBtn'); await page.waitForTimeout(100);
  check(await page.isVisible('#contBtn'), `[${label}] main menu offers Continue`);
  await click(page, '#contBtn'); await page.waitForTimeout(200);
  check(await T(page, () => window.__T.UI.mode === 'play' && window.__T.GS.speed > 0), `[${label}] Continue from main menu runs again`);

  const tBefore = (await saved(page)).gs.time;
  await run(page, SIM, [60, false]);
  await T(page, () => { window.__T.GS.speed = 1; Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  const tAfter = (await saved(page)).gs.time;
  check(tAfter > tBefore + 50, `[${label}] switching away saves (${tBefore.toFixed(0)}s -> ${tAfter.toFixed(0)}s)`);
  check(await page.isVisible('#menu'), `[${label}] switching away pauses`);

  await click(page, '#resumeBtn');
  await run(page, SIM, [60, false]);
  const tLive = await T(page, () => window.__T.GS.time);
  await page.close();
  page = await open();
  const tSaved = await T(page, () => window.__T.GS.time);
  check(Math.abs(tSaved - tLive) < 1, `[${label}] closing the tab saves (${tLive.toFixed(0)}s live, ${tSaved.toFixed(0)}s restored)`);

  if (label === 'rome') {
    await click(page, '#contBtn'); await page.waitForTimeout(200);
    await T(page, () => window.__T.endCampaign(true));
    check((await saved(page)) === null, `[${label}] finished campaign clears the save`);
  }
  check(!errors.length, `[${label}] no script errors${errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''}`);
  await ctx.close();
}

export default async function saveResume() {
  const site = await serve();
  const browser = await launch();
  try {
    await scenario(browser, site.url, '#startBtn', 'rome');
    await scenario(browser, site.url, '#autoBtn', 'autoplay');
  } finally { await browser.close(); site.close(); }
}
