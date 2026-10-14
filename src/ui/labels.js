import { seesArmy, seesBattle, seesCity } from '../game/sight.js';
import { GS, MAP, menOf, starsOf } from '../game/state.js';
import { $, clamp } from '../core/util.js';
import { cellToWorld } from '../render/world.js';
import { pathLines, ringFor, selRings, setPathLine } from '../render/overlays.js';
import { CAM, projectCell } from '../render/camera.js';
import { FIG_MEN } from '../render/crowds.js';
import { FACTIONS } from '../game/data.js';
import { DISPUTED } from '../game/standing.js';
import { sideMen } from '../game/battles.js';
import { fcss, fmt } from './format.js';
import { _pp, ME, UI } from './state.js';

/* =========================================================
   Map labels
   ========================================================= */
export const $labels = $('labels');
export const LBL = { prov: [], city: [], army: new Map(), battle: new Map() };
export function mkLabel(cls, html) { const el = document.createElement('div'); el.className = 'lb ' + cls; el.innerHTML = html; $labels.appendChild(el); return { el, last: {} }; }
export function buildMapLabels() {
  $labels.innerHTML = ''; LBL.prov = []; LBL.city = []; LBL.army.clear(); LBL.battle.clear();
  for (const P of MAP.provinces) LBL.prov.push(Object.assign(mkLabel('pv', P.name), { P }));
  for (const c of MAP.cities) LBL.city.push(Object.assign(mkLabel('ct' + (c.major ? ' major' : ''), ''), { c }));
}
export function placeLabel(L, x, y, h, dy) {
  projectCell(x, y, h, _pp);
  const W = window.innerWidth, H = window.innerHeight;
  const vis = _pp.vis && _pp.x > -80 && _pp.x < W + 80 && _pp.y > -40 && _pp.y < H + 40;
  if (L.last.vis !== vis) { L.el.style.display = vis ? '' : 'none'; L.last.vis = vis; }
  if (vis) L.el.style.transform = `translate(${_pp.x.toFixed(0)}px, ${(_pp.y + (dy || 0)).toFixed(0)}px) translate(-50%, -100%)`;
  return vis;
}
export function setHtml(L, key, v) { if (L.last[key] !== v) { L.last[key] = v; L.el.innerHTML = v; } }
export function setStyle(L, key, prop, v) { if (L.last[key] !== v) { L.last[key] = v; L.el.style[prop] = v; } }
export function updateLabels() {
  const d = CAM.d;
  const provOp = clamp((d - 45) / 35, 0, 1);
  for (const L of LBL.prov) {
    const P = L.P;
    if (provOp <= 0.02) { if (L.last.vis !== false) { L.el.style.display = 'none'; L.last.vis = false; } continue; }
    if (placeLabel(L, P.cx, P.cy, 1.5, 0)) {
      setStyle(L, 'op', 'opacity', provOp.toFixed(2));
      setStyle(L, 'col', 'color', P.owner >= 0 ? FACTIONS[P.owner].css : P.owner === DISPUTED ? '#f1e6cd' : 'rgba(255,255,255,.85)');
      setStyle(L, 'dis', 'textDecoration', P.owner === DISPUTED ? 'underline dashed rgba(241, 230, 205, .7)' : 'none');   // disputed: dashed underline
    }
  }
  const showSmall = d < 95, showMil = d < 55;
  for (const L of LBL.city) {
    const c = L.c;
    if (!c.major && !showSmall) { if (L.last.vis !== false) { L.el.style.display = 'none'; L.last.vis = false; } continue; }
    if (!placeLabel(L, c.x, c.y, c.major ? 1.6 : 0.9, -2)) continue;
    const sieged = c.battle && !c.battle.done;
    const html = `${c.capital ? '<span class="crown">★</span>' : ''}${c.name}${c.walls ? ` <span class="w">${'▮'.repeat(c.walls)}</span>` : ''}${showMil && seesCity(c) ? ` <span class="mil">${fmt(c.militia)}</span>` : ''}`;
    setHtml(L, 'h', html);
    setStyle(L, 'bc', 'borderLeftColor', fcss(c.owner));
    const cls = 'lb ct' + (c.major ? ' major' : '') + (sieged ? ' siege' : '');
    if (L.last.cls !== cls) { L.last.cls = cls; L.el.className = cls; }
  }
  // armies (decluttered: big and selected armies first, overlapping banners hidden)
  const seen = new Set(), cand = [];
  const W = window.innerWidth, H = window.innerHeight;
  for (const a of GS.armies) {
    if (a.dead) continue;
    seen.add(a.id);
    let L = LBL.army.get(a.id);
    if (!L) { L = mkLabel('ar', ''); LBL.army.set(a.id, L); }
    projectCell(a.x, a.y, 0.75, _pp);
    const vis = _pp.vis && _pp.x > -80 && _pp.x < W + 80 && _pp.y > -40 && _pp.y < H + 40 && seesArmy(a);
    if (!vis) { if (L.last.vis !== false) { L.el.style.display = 'none'; L.last.vis = false; } continue; }
    const st = starsOf(a);
    const html = `<i class="fl" style="background:${FACTIONS[a.owner].css}"></i>${fmt(menOf(a.comp))}${a.comp.siege >= 1 ? ` <span class="tt">+${Math.floor(a.comp.siege)}⚙</span>` : ''}${st ? ` <span class="st">${'★'.repeat(st)}</span>` : ''}${a.stance === 'def' ? ' <span class="tt">🛡</span>' : ''}${a.state === 'rout' ? ' <span class="tt">routing</span>' : ''}`;
    if (L.last.h !== html) { L.last.h = html; L.el.innerHTML = html; L.w = 0; }
    const sel = UI.sel.includes(a) || UI.selEnemy === a;
    const cls = 'lb ar' + (sel ? ' sel' : '') + (a.state === 'rout' ? ' rout' : '');
    if (L.last.cls !== cls) { L.last.cls = cls; L.el.className = cls; L.w = 0; }
    cand.push({ L, x: _pp.x, y: _pp.y - 4, pri: (sel ? 1e6 : 0) + (a.owner === ME ? 5e4 : 0) + menOf(a.comp) });
  }
  cand.sort((p, q) => q.pri - p.pri);
  const placed = [];
  for (const c of cand) {
    const L = c.L;
    if (!L.w) { if (L.last.vis === false) { L.el.style.display = ''; L.last.vis = true; } L.w = L.el.offsetWidth || 60; }
    const x0 = c.x - L.w / 2, y0 = c.y - 20;
    const hit = c.pri < 1e6 && placed.some((r) => x0 < r[2] - 6 && x0 + L.w > r[0] + 6 && y0 < r[3] - 4 && y0 + 20 > r[1] + 4);
    if (hit) { if (L.last.vis !== false) { L.el.style.display = 'none'; L.last.vis = false; } continue; }
    placed.push([x0, y0, x0 + L.w, y0 + 20]);
    if (L.last.vis !== true) { L.el.style.display = ''; L.last.vis = true; }
    L.el.style.transform = `translate(${c.x.toFixed(0)}px, ${c.y.toFixed(0)}px) translate(-50%, -100%)`;
  }
  for (const [id, L] of LBL.army) if (!seen.has(id)) { L.el.remove(); LBL.army.delete(id); }
  const seenB = new Set();
  for (const B of GS.battles) {
    if (B.done) continue;
    seenB.add(B.id);
    let L = LBL.battle.get(B.id);
    if (!L) { L = mkLabel('bt', ''); LBL.battle.set(B.id, L); }
    if (!seesBattle(B)) { if (L.last.vis !== false) { L.el.style.display = 'none'; L.last.vis = false; } continue; }
    if (!placeLabel(L, B.x, B.y, 1.6, -22)) continue;
    const m0 = sideMen(B.sides[0]), m1 = sideMen(B.sides[1]), tot = Math.max(1, m0 + m1);
    setHtml(L, 'h', `⚔ ${fmt(m0)} <span class="bar"><i style="width:${(m0 / tot * 100).toFixed(0)}%;background:${fcss(B.sides[0].faction)}"></i><i style="width:${(m1 / tot * 100).toFixed(0)}%;background:${fcss(B.sides[1].faction)}"></i></span> ${fmt(m1)}`);
  }
  for (const [id, L] of LBL.battle) if (!seenB.has(id)) { L.el.remove(); LBL.battle.delete(id); }
}

/* ---------- selection visuals ---------- */
export function updateSelectionVisuals() {
  let k = 0;
  const ringAt = (x, y, r, color) => {
    const R = ringFor(k++);
    cellToWorld(x, y, R.position); R.position.y = Math.max(R.position.y, 0) + 0.08;
    R.scale.setScalar(r); R.visible = true;
  };
  for (const a of UI.sel) if (!a.dead) ringAt(a.x, a.y, 0.75 + Math.sqrt(Math.max(1, menOf(a.comp) / FIG_MEN)) * 0.11);
  if (UI.selEnemy && !UI.selEnemy.dead) ringAt(UI.selEnemy.x, UI.selEnemy.y, 0.75 + Math.sqrt(Math.max(1, menOf(UI.selEnemy.comp) / FIG_MEN)) * 0.11);
  if (UI.selCity) ringAt(UI.selCity.x, UI.selCity.y, UI.selCity.major ? 2.0 : 1.25);
  if (UI.selFort && !UI.selFort.dead) ringAt(UI.selFort.x, UI.selFort.y, 1.0);
  for (let i = k; i < selRings.length; i++) if (selRings[i]) selRings[i].visible = false;
  let j = 0;
  for (const a of UI.sel) if (!a.dead && a.owner === ME) setPathLine(j++, a);
  if (GS.auto && UI.selEnemy && !UI.selEnemy.dead) setPathLine(j++, UI.selEnemy);
  for (let i = j; i < pathLines.length; i++) if (pathLines[i]) pathLines[i].visible = false;
}
