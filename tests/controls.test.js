// Controls: on a phone, the dock, a march planned with one tap and given with a second, an attack card,
// a long press that adds an army to the selection, a turn played from the dock, and the layout held upright and
// sideways; on a desktop, the keys that step through the armies, and a turn played out by Enter.
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
    // open ground the march can reach, whose spot on screen is clear of every army and city (their tap zones are wide)
    const spot = await run(page, `(id) => { const T = window.__T; const a = T.GS.armies.find((x) => x.id === id), o = {};
      for (let r = 6; r < 12; r++) for (let k = 0; k < 24; k++) { const x = Math.round(a.x + Math.cos(k / 24 * 6.283) * r), y = Math.round(a.y + Math.sin(k / 24 * 6.283) * r), i = T.cellOf(x, y);
        if (!(T.MAP.move[i] < Infinity && T.GS.cityAt[i] < 0 && T.findPath(a.x, a.y, x, y, a.owner))) continue;
        T.focusOn({ x, y: y + 2 }); T.CAM.x = T.CAM.tx; T.CAM.z = T.CAM.tz; T.CAM.d = T.CAM.td = 45; T.applyCamera();
        T.projectCell(x, y, 0, o); const h = T.hitTest(o.x, o.y);
        if (h && h.kind === 'prov') return { x, y }; } return null; }`, setup.a);
    await run(page, LOOK, [spot.x, spot.y + 2, 45]);
    await page.waitForTimeout(400);
    let p = await run(page, SCREEN, [spot.x, spot.y, 0]);
    const ground = await run(page, `([x, y]) => { const h = window.__T.hitTest(x, y); return h && h.kind; }`, [p.x, p.y]);
    await page.touchscreen.tap(p.x, p.y);
    const plan = await run(page, `() => { const T = window.__T, o = T.UI.order; T.updateLabels(); const f = document.querySelector('.lb.flag'); return { order: !!o && !o.h && o.ok, eta: o && Math.round(o.eta), flag: !!f && f.style.display !== 'none', panel: document.getElementById('panel').textContent.includes('Tap the standard again'), state: T.UI.sel[0].state }; }`);
    check(ground === 'prov' && plan.order && plan.flag && plan.panel && plan.state === 'idle', `[phone] a tap on the map plants the standard and waits (${plan.eta} s of march, the army ${plan.state})${ground === 'prov' && plan.order && plan.flag && plan.panel ? '' : ` [hit ${ground}, order ${plan.order}, flag ${plan.flag}, panel ${plan.panel}]`}`);
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

    // a turn from the dock: End turn plays it out; while it plays, Pause takes the place of Armies, the speed steps,
    // orders wait; Skip ends it, with the report of the turn (the frame loop held still: setFreeze)
    await run(page, `() => { const T = window.__T; T.setFreeze(true); T.GS.speed = 1; T.UI.lastSpeed = 1; T.clearSel(); T.renderPanel(true); T.updateHUD(); }`);
    const shown = (id) => `getComputedStyle(document.getElementById('${id}')).display !== 'none'`;
    const t0 = await run(page, `() => ({ time: window.__T.GS.time, phase: window.__T.UI.phase, label: document.getElementById('dkTurnTxt').textContent, armies: ${shown('dkArmies')}, pause: ${shown('dkPlay')} })`);
    await page.tap('#dkTurn');
    const playing = await run(page, `() => ({ phase: window.__T.UI.phase, label: document.getElementById('dkTurnTxt').textContent, armies: ${shown('dkArmies')}, pause: ${shown('dkPlay')} })`);
    check(t0.phase === 'orders' && t0.label === 'End turn' && t0.armies && !t0.pause && playing.phase === 'play' && playing.label === 'Skip' && !playing.armies && playing.pause,
      `[phone] End turn plays the turn: the button now reads ${playing.label}, and Pause takes the place of Armies (${JSON.stringify([t0, playing])})`);
    await page.tap('#dkPlay');
    const paused = await run(page, `() => ({ speed: window.__T.GS.speed, label: document.querySelector('#dkPlay span').textContent })`);
    await page.tap('#dkSpeed');
    const sped = await run(page, `() => window.__T.GS.speed`);
    check(paused.speed === 0 && paused.label === 'Play' && sped === 2, `[phone] the dock pauses the turn (then reads ${paused.label}) and steps the speed (now ${sped}×)`);
    const refused = await run(page, `() => { const T = window.__T, a = T.myArmies()[0]; T.UI.sel = [a]; const before = a.target; const ok = T.issueOrder(null, { x: Math.round(a.x) + 3, y: Math.round(a.y) }); const same = a.target === before; T.clearSel(); return !ok && same; }`);
    check(refused, '[phone] an order given while the turn plays out is refused');
    await page.tap('#dkTurn');
    const after = await run(page, `() => ({ phase: window.__T.UI.phase, time: window.__T.GS.time, report: !document.getElementById('turnrep').classList.contains('hidden'), label: document.getElementById('dkTurnTxt').textContent })`);
    check(after.phase === 'orders' && Math.abs(after.time - (Math.floor(t0.time / 30 + 1e-6) + 1) * 30) < 1e-3 && after.report && after.label === 'End turn',
      `[phone] Skip plays the rest of the turn and stops at its end (${after.time.toFixed(2)} s), with the report of the turn`);
    await run(page, `() => { const T = window.__T; T.hideTurnReport(); T.GS.speed = 0; T.setFreeze(false); T.UI.sel = T.myArmies().slice(0, 2); T.renderPanel(true); }`);
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
    // Enter ends the turn; the frame loop plays it out at the chosen speed and stops at its end by itself
    await run(D.page, `() => { const T = window.__T; T.clearSel(); T.setNoRender(true); T.UI.lastSpeed = 8; T.GS.speed = 8; document.activeElement && document.activeElement.blur(); }`);
    const d0 = await run(D.page, `() => ({ time: window.__T.GS.time, txt: document.getElementById('endTurnTxt').textContent })`);
    await D.page.keyboard.press('Enter');
    const d1 = await run(D.page, `() => ({ phase: window.__T.UI.phase, txt: (window.__T.updateHUD(), document.getElementById('endTurnTxt').textContent) })`);
    await D.page.waitForFunction(() => window.__T.UI.phase === 'orders', null, { timeout: 90000 });
    const d2 = await run(D.page, `() => ({ time: window.__T.GS.time, txt: document.getElementById('endTurnTxt').textContent, turn: document.getElementById('turnNo').textContent, report: !document.getElementById('turnrep').classList.contains('hidden') })`);
    await run(D.page, `() => { window.__T.GS.speed = 0; }`);
    check(d0.txt === 'End turn' && d1.phase === 'play' && d1.txt === 'Skip' && Math.abs(d2.time - 30) < 1e-3 && d2.turn === 'Turn 2' && d2.report && d2.txt === 'End turn',
      `[desktop] Enter plays the turn out, and the world stops at its end: ${d2.turn}, the report shown (${JSON.stringify([d0, d1, d2])})`);
    check(!D.errors.length, `[desktop] no script errors${D.errors.length ? ': ' + D.errors.slice(0, 5).join(' | ') : ''}`);
    await D.ctx.close();
  } finally { await browser.close(); site.close(); }
}
