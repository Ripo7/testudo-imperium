import { canAfford, cellOf, GS, MAP } from '../game/state.js';
import { $, clamp } from '../core/util.js';
import { Sfx } from '../core/audio.js';
import { ghost } from '../render/overlays.js';
import { CAM, pickCell, projectCell } from '../render/camera.js';
import { updateTerrainColors } from '../render/terrain.js';
import { fortGeo } from '../render/cities.js';
import { FACTIONS, fortCost, PLAYER } from '../game/data.js';
import { canOrder, orderMove, orderTarget } from '../game/armies.js';
import { estimateOdds } from '../game/battles.js';
import { buildFort, fortSpotOk } from '../game/economy.js';
import { fmtInt, oddsWord } from './format.js';
import { renderPanel } from './panel.js';
import { flashHint, log } from './hud.js';
import { DIR } from './director.js';

/* =========================================================
   UI state
   ========================================================= */
export const SPECT = -9;
export let ME = PLAYER;
export function setME(v) { ME = v; }
// the power the human commands; SPECT while autoplay runs everything
export const UI = { viewF: PLAYER, mode: 'title', sel: [], selCity: null, selFort: null, selProv: null, selBattle: null, selEnemy: null, placing: false, hold: false, panelT: 0, hudT: 0, t: 0, lastSpeed: 1, popup: null };
export const $panel = $('panel'), $popup = $('popup'), $tip = $('tip'), $log = $('log'), $hint = $('hintbar');

export function clearSel(keepProv) {
  UI.selDip = null; UI.sel = []; UI.selCity = null; UI.selFort = null; UI.selBattle = null; UI.selEnemy = null;
  if (!keepProv && UI.selProv != null) { UI.selProv = null; updateTerrainColors(); }
  hidePopup();
}
export function selectThing(h, add) {
  hidePopup();
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
export function hitTest(sx, sy) {
  let best = null, bd = Infinity;
  const consider = (kind, ref, x, y, h, r) => {
    projectCell(x, y, h, _pp);
    if (!_pp.vis) return;
    const d = Math.hypot(_pp.x - sx, _pp.y - sy);
    if (d < r && d < bd) { bd = d; best = { kind, ref }; }
  };
  const zoomK = clamp(70 / CAM.d, 0.6, 3);
  for (const B of GS.battles) if (!B.done) consider('battle', B, B.x, B.y, 1.2, 26);
  for (const a of GS.armies) if (!a.dead) consider('army', a, a.x, a.y, 0.3, Math.max(20, 22 * zoomK));
  if (best) return best;
  for (const c of MAP.cities) consider('city', c, c.x, c.y, 0.3, c.major ? Math.max(24, 30 * zoomK) : Math.max(14, 18 * zoomK));
  for (const f of GS.forts) if (!f.dead) consider('fort', f, f.x, f.y, 0.3, Math.max(14, 16 * zoomK));
  if (best) return best;
  const cell = pickCell(sx, sy);
  if (cell) { const p = MAP.prov[cellOf(cell.x, cell.y)]; if (p >= 0) return { kind: 'prov', ref: MAP.provinces[p], cell }; }
  return null;
}
export function myOrderables() { return UI.sel.filter((a) => !a.dead && a.owner === ME && canOrder(a)); }

/* ---------- orders ---------- */
export function stationSpot(c, k) {
  const offs = [[1.5, 1.3], [-1.5, 1.3], [1.5, -1.3], [-1.5, -1.3], [0, 2], [2, 0], [0, -2], [-2, 0]];
  for (let i = 0; i < offs.length; i++) {
    const [dx, dy] = offs[(k + i) % offs.length];
    if (MAP.cost[cellOf(c.x + dx, c.y + dy)] < Infinity) return { x: c.x + dx, y: c.y + dy };
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
    else if (h && h.kind === 'battle') { any = orderMove(a, h.ref.x, h.ref.y) || any; hostile = true; }
    else if (cell) {
      const n = arms.length, row = Math.ceil(Math.sqrt(n)), ix = k % row, iy = Math.floor(k / row);
      any = orderMove(a, cell.x + (ix - (row - 1) / 2) * 2.2, cell.y + iy * 2.2) || any;
    }
  });
  if (any) { if (hostile) Sfx.horn(); else Sfx.click(); }
  else { Sfx.deny(); flashHint('No path there.'); }
  renderPanel(true);
  return any;
}
export function attackPreview(h) {
  const arms = myOrderables();
  if (!arms.length || !h) return null;
  if (h.kind === 'army' && h.ref.owner !== ME) return estimateOdds(arms, { kind: 'army', ref: h.ref });
  if ((h.kind === 'city' || h.kind === 'fort') && h.ref.owner !== ME) return estimateOdds(arms, { kind: h.kind, ref: h.ref });
  return null;
}
export function oddsHtml(o, title) {
  const [w, cls] = oddsWord(o.p);
  const mods = o.mods.map(([n, e]) => `<li>${n}: ${e}</li>`).join('');
  return `<div class="odds"><div style="font-size:11px;opacity:.75">${title || 'Odds of victory'}</div><div class="big ${cls}">${Math.round(o.p * 100)}% — ${w}</div><div style="font-size:11.5px;opacity:.85">Expected losses ≈ ${fmtInt(o.attLoss)} men</div>${mods ? `<ul>${mods}</ul>` : ''}</div>`;
}

/* ---------- popup (touch) ---------- */
export function showPopup(sx, sy, html) {
  $popup.innerHTML = html;
  $popup.classList.remove('hidden');
  const w = $popup.offsetWidth, hgt = $popup.offsetHeight;
  $popup.style.left = clamp(sx - w / 2, 8, window.innerWidth - w - 8) + 'px';
  $popup.style.top = clamp(sy - hgt - 18, 70, window.innerHeight - hgt - 8) + 'px';
}
export function hidePopup() { $popup.classList.add('hidden'); UI.popup = null; }
export function tapAt(sx, sy) {
  const h = hitTest(sx, sy);
  if (UI.placing) { placeFortAt(h && h.cell ? h.cell : pickCell(sx, sy)); return; }
  const arms = myOrderables();
  if (!arms.length) { selectThing(h && h.kind !== 'prov' ? h : (h ? { kind: 'prov', ref: h.ref } : null)); return; }
  if (!h) return;
  if (h.kind === 'prov') { issueOrder(null, h.cell); hidePopup(); return; }
  const name = h.kind === 'army' ? (h.ref.owner === ME ? 'Roman army' : `${FACTIONS[h.ref.owner].adj} army`) : h.kind === 'city' ? h.ref.name : h.kind === 'fort' ? 'Fort' : 'Battle';
  UI.popup = h;
  let html = `<h3>${name}</h3>`;
  if (h.kind === 'army' && h.ref.owner === ME) {
    if (UI.sel.includes(h.ref)) { selectThing(h); return; }
    html += `<button class="abtn primary" data-pop="merge">Merge into this army</button><button class="abtn" data-pop="select">Select it instead</button>`;
  } else if (h.kind === 'city' && h.ref.owner === ME) {
    html += `<button class="abtn primary" data-pop="go">March here</button><button class="abtn" data-pop="select">Open city</button>`;
  } else if (h.kind === 'battle') {
    html += `<button class="abtn primary" data-pop="go">Join the battle</button><button class="abtn" data-pop="select">Watch details</button>`;
  } else {
    const o = attackPreview(h);
    html += (o ? oddsHtml(o) : '') + `<div class="row2"><button class="abtn danger" data-pop="go">Attack</button><button class="abtn" data-pop="select">Inspect</button></div>`;
  }
  html += `<button class="abtn" data-pop="close" style="justify-content:center">Cancel</button>`;
  showPopup(sx, sy, html);
}
$popup.addEventListener('click', (e) => {
  const b = e.target.closest('[data-pop]'); if (!b || !UI.popup) return;
  const h = UI.popup, act = b.dataset.pop;
  hidePopup();
  if (act === 'go' || act === 'merge') issueOrder(h);
  else if (act === 'select') selectThing(h);
});

/* ---------- fort placement ---------- */
export function startPlacing() {
  const F = GS.factions[ME];
  if (!canAfford(F, fortCost(ME))) { flashHint('Not enough resources for a fort.'); Sfx.deny(); return; }
  UI.placing = true; $('placebar').classList.remove('hidden'); hidePopup();
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
