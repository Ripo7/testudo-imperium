// Controls: on a phone, the dock, a march planned with one tap and given with a second, an attack card,
// a long press that adds an army to the selection, and the layout held upright and sideways;
// on a desktop, the keys that step through the armies.
import { serve, launch, openGame, run, check } from './helpers.js';

// a still camera over (x, y) and the screen position of a map cell
const LOOK = `([x, y, d]) => { const T = window.__T; T.focusOn({ x, y }); T.CAM.x = T.CAM.tx; T.CAM.z = T.CAM.tz; T.CAM.d = T.CAM.td = d; T.applyCamera(); }`;
const SCREEN = `([x, y, h]) => { const T = window.__T, o = {}; T.projectCell(x, y, h, o); return { x: o.x, y: o.y, vis: o.vis }; }`;

export default async function controls() {
  const site = await serve();
  const browser = await launch();
  try {
    const { ctx, page, errors } = await openGame(browser, site.url, { viewport: { width: 390, height: 780 }, mobile: true });
    await page.evaluate(() => document.querySelector('#startBtn').click());
    await page.waitForFunction(() => window.__T.UI.mode === 'play');
    // a still world, a second army beside the first
    const setup = await run(page, `() => { const T = window.__T; T.GS.speed = 0; for (const k of Object.keys(T.Sfx)) if (typeof T.Sfx[k] === 'function') T.Sfx[k] = () => {};
      const a = T.GS.armies.find((x) => x.owner === T.PLAYER); const b = T.makeArmy(T.PLAYER, { spear: 200 }, a.x + 3, a.y + 1);
      T.clearSel(); T.renderPanel(true); return { a: a.id, b: b.id, dock: getComputedStyle(document.getElementById('dock')).display, speed: getComputedStyle(document.getElementById('speed')).display }; }`);
    check(setup.dock !== 'none' && setup.speed === 'none', `[phone] the dock replaces the speed buttons of the top bar (dock ${setup.dock}, speed ${setup.speed})`);

    // the Armies button selects an army
    await page.tap('#dkArmies');
    const first = await run(page, `() => window.__T.UI.sel.map((a) => a.id)`);
    check(first.length === 1, `[phone] Armies selects one army (${first})`);
    await page.tap('#dkArmies');
    const second = await run(page, `() => window.__T.UI.sel.map((a) => a.id)`);
    check(second.length === 1 && second[0] !== first[0], `[phone] Armies again steps to the next one (${first} then ${second})`);

    // a tap on open ground plans the march; a second tap gives it
    await run(page, `(id) => { const T = window.__T; const a = T.GS.armies.find((x) => x.id === id); T.clearSel(); T.UI.sel = [a]; T.renderPanel(true); }`, setup.a);
    const spot = await run(page, `(id) => { const T = window.__T; const a = T.GS.armies.find((x) => x.id === id);
      for (let r = 6; r < 12; r++) for (let k = 0; k < 24; k++) { const x = Math.round(a.x + Math.cos(k / 24 * 6.283) * r), y = Math.round(a.y + Math.sin(k / 24 * 6.283) * r), i = T.cellOf(x, y);
        if (T.MAP.move[i] < Infinity && T.GS.cityAt[i] < 0 && T.findPath(a.x, a.y, x, y, a.owner)) return { x, y }; } return null; }`, setup.a);
    await run(page, LOOK, [spot.x, spot.y + 2, 45]);
    await page.waitForTimeout(400);
    let p = await run(page, SCREEN, [spot.x, spot.y, 0]);
    const ground = await run(page, `([x, y]) => { const h = window.__T.hitTest(x, y); return h && h.kind; }`, [p.x, p.y]);
    await page.touchscreen.tap(p.x, p.y);
    const plan = await run(page, `() => { const T = window.__T, o = T.UI.order; T.updateLabels(); const f = document.querySelector('.lb.flag'); return { order: !!o && !o.h && o.ok, eta: o && Math.round(o.eta), flag: !!f && f.style.display !== 'none', panel: document.getElementById('panel').textContent.includes('Tap the standard again'), state: T.UI.sel[0].state }; }`);
    check(ground === 'prov' && plan.order && plan.flag && plan.panel && plan.state === 'idle', `[phone] a tap on the map plants the standard and waits (about ${plan.eta} s of march, the army ${plan.state})`);
    p = await run(page, SCREEN, [spot.x, spot.y, 0]);
    await page.touchscreen.tap(p.x + 4, p.y - 18);   // on the cloth of the standard
    const go = await run(page, `() => { const T = window.__T, a = T.UI.sel[0]; return { order: T.UI.order, state: a.state, path: !!a.path }; }`);
    check(!go.order && go.state === 'move' && go.path, `[phone] a second tap on the standard gives the order (the army ${go.state})`);

    // a tap on a town that is not ours: the attack card; its ✕ drops it and keeps the army
    const town = await run(page, `(id) => { const T = window.__T; const a = T.GS.armies.find((x) => x.id === id); a.path = null; a.state = 'idle'; a.target = null;
      const c = T.MAP.cities.filter((x) => x.owner !== T.PLAYER).sort((p, q) => Math.hypot(p.x - a.x, p.y - a.y) - Math.hypot(q.x - a.x, q.y - a.y))[0]; return { x: c.x, y: c.y, id: c.id }; }`, setup.a);
    await run(page, LOOK, [town.x, town.y + 2, 45]);
    await page.waitForTimeout(400);
    p = await run(page, SCREEN, [town.x, town.y, 0.3]);
    await page.touchscreen.tap(p.x, p.y);
    const card = await run(page, `() => { const T = window.__T, o = T.UI.order; T.updateSelectionVisuals(); return { kind: o && o.h && o.h.kind, ring: T.targetRing.visible, attack: !!document.querySelector('#panel [data-act="confirm"].danger'), sel: T.UI.sel.length, panel: document.getElementById('panel').textContent.slice(0, 60) }; }`);
    check(card.kind === 'city' && card.ring && card.attack, `[phone] a tap on a town not ours shows the odds and an Attack button, and rings the town${card.kind === 'city' && card.ring && card.attack ? '' : ` (${JSON.stringify(card)})`}`);
    await page.tap('#panel .x');
    const back = await run(page, `() => { const T = window.__T; return { order: T.UI.order, sel: T.UI.sel.length, army: document.getElementById('panel').textContent.includes('Halt') }; }`);
    check(!back.order && back.sel === 1 && back.army, `[phone] the card's ✕ drops the order and keeps the army selected`);

    // a long press on the other army adds it to the selection
    const bp = await run(page, `(id) => { const a = window.__T.GS.armies.find((x) => x.id === id); return [a.x, a.y]; }`, setup.b);
    await run(page, LOOK, [bp[0], bp[1] + 2, 45]);
    await page.waitForTimeout(400);
    p = await run(page, `(id) => { const T = window.__T, a = T.GS.armies.find((x) => x.id === id), o = {}; T.projectCell(a.x, a.y, 0.3, o); return { x: o.x, y: o.y }; }`, setup.b);
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y }] });
    await page.waitForTimeout(800);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const both = await run(page, `([a, b]) => { const ids = window.__T.UI.sel.map((x) => x.id); return { ids, ok: ids.includes(a) && ids.includes(b) }; }`, [setup.a, setup.b]);
    check(both.ok, `[phone] a long press on another army adds it to the selection (${both.ids})`);

    // pause, speed and map view from the dock
    await run(page, `() => { window.__T.GS.speed = 1; window.__T.UI.lastSpeed = 1; }`);
    await page.tap('#dkPause');
    const paused = await run(page, `() => ({ speed: window.__T.GS.speed, label: document.querySelector('#dkPause span').textContent })`);
    await page.tap('#dkSpeed');
    const sped = await run(page, `() => window.__T.GS.speed`);
    await run(page, `() => { window.__T.GS.speed = 0; }`);
    check(paused.speed === 0 && paused.label === 'Play' && sped === 2, `[phone] the dock pauses (then reads ${paused.label}) and steps the speed (now ${sped}×)`);
    await page.tap('#dkView');
    const hid = await run(page, `() => { const st = document.getElementById('stand'); return { stand: getComputedStyle(st).display, txt: document.getElementById('dkViewTxt').textContent }; }`);
    await page.tap('#dkView');
    check(hid.stand === 'none' && hid.txt === 'Show', `[phone] Hide clears the standings off the map, and then reads ${hid.txt}`);

    // the layout: upright, the panel is a sheet above the dock and the top is one strip; sideways, the panel opens on the left
    const up = await run(page, `() => { const r = (id) => document.getElementById(id).getBoundingClientRect(); return { top: r('top').height, panelBottom: r('panel').bottom, dockTop: r('dock').top, panelW: r('panel').width }; }`);
    check(up.top < 64 && Math.abs(up.panelBottom - up.dockTop) < 2 && up.panelW > 380, `[phone] upright: a ${Math.round(up.top)} px top strip, the panel over the dock`);
    await page.setViewportSize({ width: 800, height: 370 });
    await page.waitForTimeout(500);
    const side = await run(page, `() => { const r = (id) => document.getElementById(id).getBoundingClientRect(); return { panelLeft: r('panel').left, panelW: r('panel').width, panelBottom: r('panel').bottom, dockTop: r('dock').top, dock: r('dock').height, wide: document.documentElement.scrollWidth <= innerWidth }; }`);
    check(side.panelLeft === 0 && side.panelW < 420 && side.panelBottom <= side.dockTop + 1 && side.dock < 56 && side.wide, `[phone] sideways: the panel on the left (${Math.round(side.panelW)} px), a ${Math.round(side.dock)} px dock`);
    check(!errors.length, `[phone] no script errors${errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''}`);
    await ctx.close();

    // desktop: N steps through the armies, G selects them all, Escape lets go
    const D = await openGame(browser, site.url, { viewport: { width: 1100, height: 700 } });
    await D.page.evaluate(() => document.querySelector('#startBtn').click());
    await D.page.waitForFunction(() => window.__T.UI.mode === 'play');
    await run(D.page, `() => { const T = window.__T; T.GS.speed = 0; const a = T.GS.armies.find((x) => x.owner === T.PLAYER); T.makeArmy(T.PLAYER, { spear: 200 }, a.x + 3, a.y + 1); T.makeArmy(T.PLAYER, { arch: 100 }, a.x - 3, a.y); T.clearSel(); }`);
    await D.page.keyboard.press('KeyN');
    const n1 = await run(D.page, `() => window.__T.UI.sel.map((a) => a.id)`);
    await D.page.keyboard.press('KeyN');
    const n2 = await run(D.page, `() => window.__T.UI.sel.map((a) => a.id)`);
    await D.page.keyboard.press('KeyG');
    const all = await run(D.page, `() => ({ sel: window.__T.UI.sel.length, n: window.__T.myArmies().length, dock: getComputedStyle(document.getElementById('dock')).display })`);
    check(n1.length === 1 && n2.length === 1 && n1[0] !== n2[0] && all.sel === all.n && all.n >= 3, `[desktop] N steps through the armies (${n1} then ${n2}), G selects all ${all.sel}`);
    check(all.dock === 'none', '[desktop] no dock: the top bar keeps its buttons');
    check(!D.errors.length, `[desktop] no script errors${D.errors.length ? ': ' + D.errors.slice(0, 5).join(' | ') : ''}`);
    await D.ctx.close();
  } finally { await browser.close(); site.close(); }
}
