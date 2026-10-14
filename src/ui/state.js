import { seesArmy, seesBattle } from '../game/sight.js';
import { canAfford, cellOf, GS, MAP } from '../game/state.js';
import { $, clamp, isTouch } from '../core/util.js';
import { Sfx } from '../core/audio.js';
import { ghost } from '../render/overlays.js';
import { CAM, pickCell, projectCell } from '../render/camera.js';
import { updateTerrainColors } from '../render/terrain.js';
import { fortGeo } from '../render/cities.js';
import { fortCost, PLAYER } from '../game/data.js';
import { canOrder, findPath, orderMove, orderTarget, pathTime } from '../game/armies.js';
import { estimateOdds } from '../game/battles.js';
import { buildFort, fortSpotOk } from '../game/economy.js';
import { fmtInt, oddsWord } from './format.js';
import { renderPanel } from './panel.js';
import { flashHint, focusOn, log } from './hud.js';
import { DIR } from './director.js';

/* =========================================================
   UI state
   ========================================================= */
export const SPECT = -9;
export let ME = PLAYER;
export function setME(v) { ME = v; }
// the power the human commands; SPECT while autoplay runs everything
// order: the order a touch has planned for the selected armies, waiting for a second tap (see planOrder)
export const UI = { viewF: PLAYER, mode: 'title', sel: [], selCity: null, selFort: null, selProv: null, selBattle: null, selEnemy: null, placing: false, hold: false, panelT: 0, hudT: 0, t: 0, lastSpeed: 1, order: null };
export const $panel = $('panel'), $tip = $('tip'), $log = $('log'), $hint = $('hintbar');

export function clearSel(keepProv) {
  UI.selOver = null; $panel.classList.remove('full');
  UI.selDip = null; UI.sel = []; UI.selCity = null; UI.selFort = null; UI.selBattle = null; UI.selEnemy = null;
  if (!keepProv && UI.selProv != null) { UI.selProv = null; updateTerrainColors(); }
  cancelOrder();
}
export function selectThing(h, add) {
  cancelOrder();
  if (!h) { clearSel(); renderPanel(true); return; }
  if (h.kind === 'army' && h.ref.owner === ME) {
    if (add && UI.sel.length) { if (UI.sel.includes(h.ref)) UI.sel = UI.sel.filter((x) => x !== h.ref); else UI.sel.push(h.ref); }
    else { clearSel(); UI.sel = [h.ref]; }
  } else {
    clearSel(true);
    if (h.kind === 'army') UI.selEnemy = h.ref;
    else if (h.kind === 'city') UI.selCity = h.ref;
    else if (h.kind === 'fort') UI.selFort = h.ref;
    else if (h.kind === 'battle') UI.selBattle = h.ref;
    const p = h.kind === 'prov' ? h.ref.id : h.kind === 'city' ? h.ref.prov : null;
    if (p !== UI.selProv) { UI.selProv = p; updateTerrainColors(); }
  }
  Sfx.click();
  if (GS.auto && DIR.on) { if (UI.selEnemy) { DIR.tgt = { kind: 'army', ref: UI.selEnemy }; DIR.hold = 1e9; } else if (DIR.hold > 1e8) DIR.hold = 0; }
  renderPanel(true);
}

/* ---------- hit testing ---------- */
export const _pp = {};
export const TOUCH_REACH = 1.4;   // a fingertip covers more than a mouse pointer: wider hit areas on touch screens
export function hitTest(sx, sy) {
  let best = null, bd = Infinity;
  const reach = isTouch ? TOUCH_REACH : 1;
  const consider = (kind, ref, x, y, h, r) => {
    projectCell(x, y, h, _pp);
    if (!_pp.vis) return;
    const d = Math.hypot(_pp.x - sx, _pp.y - sy);
    if (d < r * reach && d < bd) { bd = d; best = { kind, ref }; }
  };
  const zoomK = clamp(70 / CAM.d, 0.6, 3);
  for (const B of GS.battles) if (!B.done && seesBattle(B)) consider('battle', B, B.x, B.y, 1.2, 26);
  for (const a of GS.armies) if (!a.dead && seesArmy(a)) consider('army', a, a.x, a.y, 0.3, Math.max(20, 22 * zoomK));
  if (best) return best;
  for (const c of MAP.cities) consider('city', c, c.x, c.y, 0.3, c.major ? Math.max(24, 30 * zoomK) : Math.max(14, 18 * zoomK));
  for (const f of GS.forts) if (!f.dead) consider('fort', f, f.x, f.y, 0.3, Math.max(14, 16 * zoomK));
  if (best) return best;
  const cell = pickCell(sx, sy);
  if (cell) { const p = MAP.prov[cellOf(cell.x, cell.y)]; if (p >= 0) return { kind: 'prov', ref: MAP.provinces[p], cell }; }
  return null;
}
export function myOrderables() { return UI.sel.filter((a) => !a.dead && a.owner === ME && canOrder(a)); }
// the armies of the commanded power, those waiting for orders first (the order the Armies button steps through)
export function myArmies() {
  const L = GS.armies.filter((a) => !a.dead && a.owner === ME);
  const rank = (a) => (a.state === 'idle' && !a.target ? 0 : 1);
  return L.sort((a, b) => rank(a) - rank(b) || a.id - b.id);
}
export const idleArmies = () => GS.armies.filter((a) => !a.dead && a.owner === ME && a.state === 'idle' && !a.target).length;
// select the next (dir 1) or previous (dir -1) army and bring it into view
export function cycleArmy(dir) {
  if (GS.auto) return;
  const L = myArmies();
  if (!L.length) { Sfx.deny(); flashHint('No army in the field: recruit one in a city.'); return; }
  const cur = UI.sel.length === 1 ? L.indexOf(UI.sel[0]) : -1;
  const a = L[cur < 0 ? (dir > 0 ? 0 : L.length - 1) : (cur + dir + L.length) % L.length];
  clearSel(true); UI.sel = [a]; focusOn(a);
  Sfx.click(); renderPanel(true);
}
export function selectAllArmies() {
  if (GS.auto) return;
  const L = myArmies();
  if (!L.length) { Sfx.deny(); flashHint('No army in the field: recruit one in a city.'); return; }
  clearSel(true); UI.sel = L.sort((a, b) => a.id - b.id);
  Sfx.click(); renderPanel(true);
}
// add an army of ours to the selection, or take it out (Shift-click; a long press on touch screens)
export function toggleInSelection(a) {
  cancelOrder();
  if (!UI.sel.length) { clearSel(true); UI.sel = [a]; }
  else if (UI.sel.includes(a)) { if (UI.sel.length > 1) UI.sel = UI.sel.filter((x) => x !== a); }
  else UI.sel.push(a);
  Sfx.click(); renderPanel(true);
}

/* ---------- orders ---------- */
export function stationSpot(c, k) {
  const offs = [[1.5, 1.3], [-1.5, 1.3], [1.5, -1.3], [-1.5, -1.3], [0, 2], [2, 0], [0, -2], [-2, 0]];
  for (let i = 0; i < offs.length; i++) {
    const [dx, dy] = offs[(k + i) % offs.length];
    if (MAP.move[cellOf(c.x + dx, c.y + dy)] < Infinity) return { x: c.x + dx, y: c.y + dy };
  }
  return { x: c.x, y: c.y };
}
export function issueOrder(h, cell) {
  const arms = myOrderables();
  if (!arms.length) return false;
  let any = false, hostile = false;
  arms.forEach((a, k) => {
    if (h && h.kind === 'army' && h.ref !== a) {
      if (h.ref.owner !== ME) { any = orderTarget(a, 'army', h.ref) || any; hostile = true; }
      else any = orderTarget(a, 'merge', h.ref) || any;
    } else if (h && h.kind === 'city') {
      if (h.ref.owner !== ME) { any = orderTarget(a, 'city', h.ref) || any; hostile = true; }
      else { const s = stationSpot(h.ref, k); any = orderMove(a, s.x, s.y) || any; }
    } else if (h && h.kind === 'fort' && h.ref.owner !== ME) { any = orderTarget(a, 'fort', h.ref) || any; hostile = true; }
    else if (h && h.kind === 'fort') { const s = stationSpot(h.ref, k); any = orderMove(a, s.x, s.y) || any; }
    else if (h && h.kind === 'battle') { any = orderMove(a, h.ref.x, h.ref.y) || any; hostile = true; }
    else if (cell) {
      const n = arms.length, row = Math.ceil(Math.sqrt(n)), ix = k % row, iy = Math.floor(k / row);
      any = orderMove(a, cell.x + (ix - (row - 1) / 2) * 2.2, cell.y + iy * 2.2) || any;
    }
  });
  if (any) { if (hostile) Sfx.horn(); else Sfx.click(); }
  else { Sfx.deny(); flashHint('No way there: wide rivers need a bridge or a ford, and the high peaks can\'t be crossed.'); }
  renderPanel(true);
  return any;
}
export function attackPreview(h) {
  const arms = myOrderables();
  if (!arms.length || !h) return null;
  if (h.kind === 'army' && h.ref.owner !== ME) return estimateOdds(arms, { kind: 'army', ref: h.ref }, 0, ME);
  if ((h.kind === 'city' || h.kind === 'fort') && h.ref.owner !== ME) return estimateOdds(arms, { kind: h.kind, ref: h.ref }, 0, ME);
  return null;
}
export function oddsHtml(o, title) {
  const [w, cls] = oddsWord(o.p);
  const mods = o.mods.map(([n, e]) => `<li>${n}: ${e}</li>`).join('');
  return `<div class="odds"><div style="font-size:11px;opacity:.75">${title || 'Odds of victory'}</div><div class="big ${cls}">${Math.round(o.p * 100)}% — ${w}</div><div style="font-size:11.5px;opacity:.85">Expected losses ≈ ${fmtInt(o.attLoss)} men</div>${mods ? `<ul>${mods}</ul>` : ''}</div>`;
}

/* ---------- orders on touch screens: plan with a tap, confirm with a second ----------
   With an army selected, a tap plants a standard where it would go (the route and the march time on the map,
   the odds in the panel); a second tap on the same spot or target, or the panel's button, gives the order.
   A stray tap only moves the standard, and the panel's ✕ drops it. */
export const SAME_SPOT = 34;   // px: a second tap this close to the standard confirms the order
export let orderSeq = 0;
export function planOrder(h, cell) {
  const arms = myOrderables();
  if (!arms.length || (!h && !cell)) return;
  const tgt = h && h.kind !== 'prov' ? h : null;
  const x = tgt ? tgt.ref.x : cell.x, y = tgt ? tgt.ref.y : cell.y;
  // the route of the army farthest from it: the march time is when the last one gets there
  const a = arms.reduce((m, b) => (Math.hypot(b.x - x, b.y - y) > Math.hypot(m.x - x, m.y - y) ? b : m), arms[0]);
  const path = findPath(a.x, a.y, x, y, ME);
  UI.order = { h: tgt, cell: tgt ? null : cell, x, y, path, ok: !!path, eta: path ? pathTime(a, path) : 0, lead: a, seq: ++orderSeq };
  Sfx.click();
  renderPanel(true);
}
export function cancelOrder() { UI.order = null; }
export function confirmOrder() {
  const o = UI.order;
  UI.order = null;
  if (!o) return false;
  if (!o.ok) { Sfx.deny(); flashHint('No way there: wide rivers need a bridge or a ford, and the high peaks can\'t be crossed.'); renderPanel(true); return false; }
  return issueOrder(o.h, o.cell || { x: o.x, y: o.y });
}
// is a tap at (sx, sy) on h a second tap on the planned order?
export function onOrder(h, sx, sy) {
  const o = UI.order;
  if (!o) return false;
  if (o.h) return !!h && h.kind === o.h.kind && h.ref === o.h.ref;
  // near the foot of the standard, or on its cloth (about 22 px above)
  projectCell(o.x, o.y, 0.2, _pp);
  return _pp.vis && Math.min(Math.hypot(_pp.x - sx, _pp.y - sy), Math.hypot(_pp.x - sx, _pp.y - 22 - sy)) < SAME_SPOT;
}
export function tapAt(sx, sy) {
  const h = hitTest(sx, sy);
  if (UI.placing) { placeFortAt(h && h.cell ? h.cell : pickCell(sx, sy)); return; }
  const arms = myOrderables();
  // nothing to command: a tap selects what it touches
  if (!arms.length) { selectThing(h && h.kind !== 'prov' ? h : (h ? { kind: 'prov', ref: h.ref } : null)); return; }
  if (!h) return;
  if (onOrder(h, sx, sy)) { confirmOrder(); return; }
  // another army of ours: select it instead (a long press adds it to the selection)
  if (h.kind === 'army' && h.ref.owner === ME) {
    if (UI.sel.includes(h.ref)) { if (UI.order || UI.sel.length > 1) { cancelOrder(); clearSel(true); UI.sel = [h.ref]; Sfx.click(); renderPanel(true); } return; }
    selectThing(h); return;
  }
  planOrder(h.kind === 'prov' || (h.kind === 'fort' && h.ref.owner === ME) ? null : h, h.cell || pickCell(sx, sy) || { x: h.ref.x, y: h.ref.y });
}
// a long press: your army joins or leaves the selection; anything else is shown in the panel
export function longPressAt(sx, sy) {
  const h = hitTest(sx, sy);
  if (!h || UI.placing) return false;
  if (h.kind === 'army' && h.ref.owner === ME && !GS.auto) toggleInSelection(h.ref);
  else selectThing(h.kind === 'prov' ? { kind: 'prov', ref: h.ref } : h);
  try { if (navigator.vibrate) navigator.vibrate(12); } catch (_) { /* ignore */ }
  return true;
}

/* ---------- fort placement ---------- */
export function startPlacing() {
  const F = GS.factions[ME];
  if (!canAfford(F, fortCost(ME))) { flashHint('Not enough resources for a fort.'); Sfx.deny(); return; }
  UI.placing = true; $('placebar').classList.remove('hidden'); cancelOrder();
  ghost.geometry = fortGeo();
}
export function stopPlacing() { UI.placing = false; ghost.visible = false; $('placebar').classList.add('hidden'); }
export function placeFortAt(cell) {
  if (!cell) return;
  const F = GS.factions[ME];
  const f = buildFort(F, cell.x, cell.y);
  if (f) { Sfx.thunk(); log('Construction of a fort has begun.', 'info', f); stopPlacing(); UI.selFort = f; UI.selCity = null; renderPanel(true); }
  else { Sfx.deny(); flashHint(fortSpotOk(ME, cell.x, cell.y) ? 'Not enough resources.' : 'Forts go on open ground inside your provinces, away from cities and other forts.'); }
}
$('placeCancel').addEventListener('click', stopPlacing);
