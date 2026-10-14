import { atWar, endEnvoy, makePeace, mins, relOf, treatyOn, warsOf } from '../game/diplomacy.js';
import { setHooks } from '../game/hooks.js';
import { DISPUTED, holdsIn, placesOf, STAND } from '../game/standing.js';
import { GS, MAP, menOf, ownerName } from '../game/state.js';
import { $, isTouch, store } from '../core/util.js';
import { Sfx } from '../core/audio.js';
import { CAM, projectCell } from '../render/camera.js';
import { buildFortMesh, refreshCityMesh, refreshFortMesh, removeFortMesh } from '../render/cities.js';
import { FACTIONS, PLAYER, pName, RES, TREATY_TIME, U } from '../game/data.js';
import { clock, fcss, fmt, fmtInt, fmtRate, fname, GLYPH, IC } from './format.js';
import { _pp, $hint, $log, clearSel, cycleArmy, idleArmies, ME, UI } from './state.js';
import { onImpDone, renderPanel } from './panel.js';
import { showOver } from './screens.js';
import { clearSave } from './persist.js';
import { battleMen, DIR, manualCam, setFollow, togglePolitical } from './director.js';
import { alertsHtml, computeAlerts, warsList } from './alerts.js';
import { sampleAgo } from '../game/chronicle.js';
import { updateTerrainColors, VIEW } from '../render/terrain.js';

/* =========================================================
   HUD: resources, standings, log
   ========================================================= */
export const $res = $('resbar');
$res.innerHTML = RES.map((r) => `<div class="res" id="r_${r}" title="${r}">${IC[r]}<div><b>0</b><br><small>+0</small></div></div>`).join('');
export const resEls = RES.map((r) => { const el = $('r_' + r); return { el, b: el.querySelector('b'), s: el.querySelector('small') }; });
export let crestKey = '', standKey = '';
export function resetCrest() { crestKey = ''; standKey = ''; }
export function relMark(Fx) {
  if (!Fx.alive) return '';
  if (GS.auto) { const n = warsOf(Fx.id); return n ? ` <small class="war" title="At war with ${n} power${n > 1 ? 's' : ''}">⚔${n > 1 ? n : ''}</small>` : ''; }
  if (Fx.isPlayer) return '';
  return atWar(PLAYER, Fx.id) ? ` <small class="war" title="At war with ${pName()}">⚔</small>` : treatyOn(PLAYER, Fx.id) ? ` <small class="peace" title="Bound by a treaty with ${pName()}">🕊</small>` : '';
}
export function updateHUD() {
  const F = GS.factions[GS.auto ? UI.viewF : PLAYER];
  const ck = F.id + ':' + GS.auto;
  if (ck !== crestKey) {
    crestKey = ck;
    $('crest').querySelector('i').style.background = F.color;
    $('crest').querySelector('span').textContent = F.crest;
    $('crestbar').title = GS.auto ? `Following ${F.name}: its treasury${GS.fog ? ' and what it sees' : ''} (click to switch)` : '';
  }
  RES.forEach((r, i) => {
    const e = resEls[i];
    const v = fmtInt(F.res[r]), rt = fmtRate(F.net[r]);
    if (e.b.textContent !== v) e.b.textContent = v;
    if (e.s.textContent !== rt + '/s') { e.s.textContent = rt + '/s'; e.s.className = F.net[r] < -0.05 ? 'neg' : F.net[r] > 0.05 ? 'pos' : ''; }
    e.el.classList.toggle('warn', (r === 'food' && F.starving) || (r === 'gold' && F.unpaid));
    e.el.title = `${r}: income ${F.inc[r].toFixed(1)}/s, upkeep ${F.upk[r].toFixed(1)}/s`;
  });
  const s = Math.floor(GS.time);
  $('clock').textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  document.querySelectorAll('#speed button').forEach((b) => b.classList.toggle('on', +b.dataset.sp === GS.speed));
  const need = STAND.need, ago = sampleAgo(60), np = GS.factions.length, PB = 1 + 3 * np;   // PB: provinces in the history rows
  const disputedFor = (f) => MAP.provinces.filter((P) => P.owner === DISPUTED && holdsIn(P, f)).length;
  let h = `<h4>The powers${GS.auto ? ', all AI' : ''}</h4>`;
  if (GS.auto && GS.fog) h += `<div class="note" style="margin:-2px 0 4px;font-size:11.5px">Seen through the eyes of <b style="color:${FACTIONS[UI.viewF].css}">${FACTIONS[UI.viewF].name}</b> · click a power to switch</div>`;
  let lead = null, leadN = -1;
  for (const Fx of GS.factions) {
    const prov = Fx.provs;
    if (prov > leadN) { leadN = prov; lead = Fx; }
    const men = GS.armies.reduce((m, a) => m + (!a.dead && a.owner === Fx.id ? menOf(a.comp) : 0), 0);
    const view = GS.auto && Fx.id === UI.viewF;
    const d = ago && Fx.alive && ago[PB + Fx.id] != null ? prov - ago[PB + Fx.id] : 0;
    const trend = d ? `<small class="tr ${d > 0 ? 'up' : 'down'}" title="${d > 0 ? 'Won' : 'Lost'} ${Math.abs(d)} province${Math.abs(d) > 1 ? 's' : ''} in the last minute">${d > 0 ? '▲' : '▼'}${Math.abs(d)}</small>` : '';
    const dis = Fx.alive ? disputedFor(Fx.id) : 0;
    const tip = !GS.auto && Fx.isPlayer ? 'Overview of your realm' : GS.auto ? `Follow ${Fx.name}` : `Talk to ${Fx.name}`;
    h += `<div class="row${Fx.alive ? '' : ' dead'}${view ? ' view' : ''}"${GS.auto || Fx.alive ? ` data-f="${Fx.id}" title="${tip}"` : ''}><i class="sw" style="background:${Fx.css}"></i><span class="nm">${Fx.name}${!GS.auto && Fx.isPlayer ? ' (you)' : ''}${relMark(Fx)}${Fx.alive && Fx.stretch < 0.995 ? ` <small class="over" title="Overstretched: income at ${Math.round(Fx.stretch * 100)}%">−${Math.round((1 - Fx.stretch) * 100)}%</small>` : ''}</span><b title="Provinces held whole${dis ? `, and ${dis} more disputed` : ''}">${trend}${prov}</b><span title="Men under arms">${fmt(men)}</span>${Fx.alive ? `<i class="vb" title="${prov} of the ${need} provinces that win the war${dis ? `; ${dis} more disputed` : ''}"><i style="width:${Math.min(100, prov / need * 100).toFixed(1)}%;background:${Fx.css}"></i></i>` : ''}</div>`;
  }
  const W = warsList();
  if (W.length) h += '<div class="wars">' + W.map((w) => `<button class="${w.war ? 'w' : 'p'}" data-wars title="${FACTIONS[w.f].name} and ${FACTIONS[w.g].name}: ${w.war ? `at war for ${clock(w.t)}` : `treaty, ${clock(w.t)} left`}"><i class="sw" style="background:${fcss(w.f)}"></i>${w.war ? GLYPH.swords : GLYPH.dove}<i class="sw" style="background:${fcss(w.g)}"></i><span>${clock(w.t)}</span></button>`).join('') + '</div>';
  if (GS.auto) h += `<div id="goal">Leader: <b style="color:${lead.css}">${lead.name}</b>, ${leadN} of ${need} provinces<div class="gbar"><i style="width:${Math.min(100, leadN / need * 100)}%;background:${lead.css}"></i></div></div>`;
  else {
    const mine = GS.factions[ME].provs, dis = disputedFor(ME);
    h += `<div id="goal">Provinces: <b>${mine} of ${need}</b>${dis ? `, ${dis} disputed` : ''}<div class="gbar"><i style="width:${Math.min(100, mine / need * 100)}%"></i></div></div>`;
  }
  // compared with what was last written, not with innerHTML: the browser writes some markup back differently (SVG),
  // so that comparison never matched and the box was rebuilt four times a second, its tooltips with it
  h += `<div class="need" title="Provinces that win the war">${need} to win</div>`;   // phones: under the race rail
  if (h !== standKey) { standKey = h; $('standRows').innerHTML = h; }
  renderAlerts(GS.auto ? UI.viewF : PLAYER);
  $('btnOver').classList.toggle('on', !!UI.selOver);
  updateDock();
}
// phones held upright (narrow) or sideways (short): the compact layout with the bottom dock
export const phoneLayout = () => window.innerWidth <= 820 || window.innerHeight <= 500;
/* ---------- the dock: the phone's commands, at the bottom of the screen ---------- */
export const ICO_PAUSE = '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>';
export const ICO_PLAY = '<path d="M7 5l12 7-12 7z"/>';
export const SPEEDS = [1, 2, 4, 8];
export let dockKey = '';
export function updateDock() {
  const paused = GS.speed === 0, sp = paused ? UI.lastSpeed : GS.speed, idle = GS.auto ? 0 : idleArmies();
  const s = Math.floor(GS.time);
  const k = [paused, sp, idle, s, GS.auto, !!UI.selOver, VIEW.political, DIR.on].join('|');
  if (k === dockKey) return;
  dockKey = k;
  $('dkPauseIco').innerHTML = paused ? ICO_PLAY : ICO_PAUSE;
  $('dkPause').querySelector('span').textContent = paused ? 'Play' : 'Pause';
  $('dkPause').classList.toggle('on', paused);
  $('dkPause').setAttribute('aria-label', paused ? 'Resume the game' : 'Pause the game');
  $('dkSpd').textContent = sp + '×';
  $('dkSpeed').classList.toggle('paused', paused);
  $('dkSpeed').title = `Speed ${sp}×: tap for ${SPEEDS[(SPEEDS.indexOf(sp) + 1) % SPEEDS.length]}×`;
  $('dkClock').textContent = clock(s);
  const b = $('dkIdle'), bt = idle ? String(idle) : '';
  if (b.textContent !== bt) { b.textContent = bt; b.classList.toggle('hidden', !bt); }
  $('dkArmies').title = idle ? `Next army (N): ${idle} waiting for orders` : 'Next army (N)';
  $('dkArmies').classList.toggle('hidden', !!GS.auto);
  $('dkFollow').classList.toggle('hidden', !GS.auto);
  $('dkFollow').classList.toggle('on', DIR.on);
  $('dkOver').classList.toggle('on', !!UI.selOver);
  $('dkMap').classList.toggle('on', !!VIEW.political);
}
$('dock').addEventListener('click', (e) => {
  const b = e.target.closest('[data-dock]'); if (!b || UI.mode !== 'play') return;
  switch (b.dataset.dock) {
    case 'armies': cycleArmy(1); break;
    case 'follow': Sfx.click(); setFollow(!DIR.on); break;
    case 'pause': setSpeed(GS.speed > 0 ? 0 : UI.lastSpeed); break;
    case 'speed': { const cur = GS.speed || UI.lastSpeed; setSpeed(SPEEDS[(SPEEDS.indexOf(cur) + 1) % SPEEDS.length]); break; }
    case 'over': toggleOverview(); break;
    case 'map': Sfx.click(); togglePolitical(); break;
    case 'view': toggleMapView(); break;
  }
  updateDock();
});
/* ---------- what is on screen ----------
   Each floating panel can be switched off in the pause menu (UI.show, kept in this browser), and the eye in the
   top bar hides them all at once (UI.mapView) to leave the map clear. Hidden dispatches still count: the eye
   shows how many urgent ones there are. */
export const PANELS = [['stand', 'Standings'], ['alerts', 'Dispatches'], ['log', 'Messages'], ['hint', 'Hints']];
export const EYE = '<path d="M12 5C6.5 5 2.7 9.4 1.5 12c1.2 2.6 5 7 10.5 7s9.3-4.4 10.5-7C21.3 9.4 17.5 5 12 5zm0 11.5a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9zm0-2.3a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4z"/>';
export const EYE_OFF = '<path d="M3.3 2 2 3.3l3.1 3.1C3.4 7.8 2.2 9.8 1.5 12c1.2 2.6 5 7 10.5 7 1.9 0 3.6-.5 5.1-1.3l3.6 3.6 1.3-1.3zM12 16.5A4.5 4.5 0 0 1 7.6 11l1.8 1.8a2.7 2.7 0 0 0 1.8 1.8l1.8 1.8c-.3.1-.7.1-1 .1zM12 5c-1.3 0-2.5.2-3.6.6l2 2c.5-.1 1-.1 1.6-.1a4.5 4.5 0 0 1 4.5 4.5c0 .5 0 1-.2 1.5l2.8 2.8c1.6-1.2 2.8-2.9 3.4-4.3C21.3 9.4 17.5 5 12 5z"/>';
export const panelShown = (k) => !UI.mapView && (!UI.show || UI.show[k] !== false);
export function applyPanels() {
  const hud = $('hud');
  for (const [k] of PANELS) hud.classList.toggle('hide-' + k, !panelShown(k));
  const b = $('btnView');
  b.classList.toggle('on', !!UI.mapView);
  b.setAttribute('aria-label', UI.mapView ? 'Show the panels' : 'Hide the panels');
  b.title = UI.mapView ? 'Show the panels again (V)' : 'Map view: hide the panels (V)';
  $('viewIco').innerHTML = $('dkViewIco').innerHTML = UI.mapView ? EYE_OFF : EYE;
  $('dkView').classList.toggle('on', !!UI.mapView);
  $('dkView').setAttribute('aria-label', b.getAttribute('aria-label'));
  $('dkViewTxt').textContent = UI.mapView ? 'Show' : 'Hide';
  alertsKey = '';
  if (UI.mode === 'play' && GS.factions.length) renderAlerts(GS.auto ? UI.viewF : PLAYER);
}
export function toggleMapView() {
  UI.mapView = !UI.mapView;
  store.set('testudo.mapView', UI.mapView);
  Sfx.click(); applyPanels();
}
// dispatches, under the crest (a scrolling row on phones); --alerts-h keeps the panel and the toasts clear of them
export let alertsKey = '';
export function renderAlerts(V) {
  const el = $('alerts'), shown = panelShown('alerts');
  const list = GS.over || UI.mode !== 'play' ? [] : computeAlerts(V);
  // hidden dispatches: the eye in the top bar counts the urgent ones
  const bad = shown ? 0 : list.filter((a) => a.sev === 'bad').length, bt = bad ? String(bad) : '';
  for (const badge of [$('viewBadge'), $('dkBadge')]) if (badge.textContent !== bt) { badge.textContent = bt; badge.classList.toggle('hidden', !bt); badge.title = bt ? `${bt} urgent dispatch${bad > 1 ? 'es' : ''}` : ''; }
  const h = shown ? alertsHtml(list, phoneLayout() ? 3 : 6) : '';
  if (h === alertsKey) return;
  alertsKey = h;
  el.innerHTML = h;
  el.classList.toggle('hidden', !h);
  $('hud').style.setProperty('--alerts-h', (h ? el.offsetHeight + 6 : 0) + 'px');
}
// show what a dispatch or a chronicle entry points at ('battle:id', 'city:id', 'army:id', 'prov:id', 'spot:x:y', 'over:tab', 'dip:f')
export function goTo(ref) {
  const [k, a, b] = ref.split(':');
  clearSel(true);
  const cam = (t) => { if (GS.auto && DIR.on && !UI.selEnemy) manualCam(); focusOn(t); };
  const prov = (p) => { if (p !== UI.selProv) { UI.selProv = p; updateTerrainColors(); } };
  if (k === 'battle') { const B = GS.battles.find((x) => x.id === +a); if (B) { if (!B.done) UI.selBattle = B; cam(B); } }
  else if (k === 'city') { const c = MAP.cities[+a]; if (c) { UI.selCity = c; prov(c.prov); cam(c); } }
  else if (k === 'army') { const A = GS.armies.find((x) => x.id === +a && !x.dead); if (A) { if (A.owner === ME && !GS.auto) UI.sel = [A]; else UI.selEnemy = A; cam(A); } }
  else if (k === 'prov') { const P = MAP.provinces[+a]; if (P) { prov(P.id); cam(MAP.cities[P.major]); } }
  else if (k === 'spot') cam({ x: +a, y: +b });
  else if (k === 'over') UI.selOver = a;
  else if (k === 'dip') { if (GS.auto) UI.selOver = 'wars'; else { UI.selDip = +a; UI.dipMsg = ''; } }
  Sfx.click();
  renderPanel(true);
}
export function toggleOverview(tab) {
  if (UI.selOver && !tab) clearSel(true);
  else { clearSel(true); UI.selOver = tab || 'empire'; }
  Sfx.click(); renderPanel(true); updateHUD();
}
$('envoy').addEventListener('click', (e) => {
  const b = e.target.closest('[data-env]'); if (!b || !GS.envoy) return;
  const E = GS.envoy;
  if (b.dataset.env === 'yes' && atWar(PLAYER, E.g)) { makePeace(PLAYER, E.g, TREATY_TIME, E.gold ? E.g : null, E.gold); Sfx.horn(); }
  else { relOf(PLAYER, E.g).nd[PLAYER] = GS.time + 90; log(`${pName()} sends the envoys of ${fname(E.g)} home.`, 'info'); Sfx.click(); }
  endEnvoy(); updateHUD(); renderPanel(true);
});
$('standRows').addEventListener('pointerdown', (e) => {
  if (e.target.closest('[data-wars]')) { toggleOverview('wars'); return; }
  const r = e.target.closest('[data-f]'); if (!r) return;
  const f = +r.dataset.f;
  if (GS.auto) { UI.viewF = f; Sfx.click(); updateHUD(); renderPanel(true); return; }
  clearSel(true);
  if (f === PLAYER) UI.selOver = 'empire'; else { UI.selDip = f; UI.dipMsg = ''; }
  Sfx.click(); renderPanel(true);
});
$('alerts').addEventListener('click', (e) => { const b = e.target.closest('[data-go]'); if (b) goTo(b.dataset.go); });
$('btnOver').addEventListener('click', () => toggleOverview());
$('btnView').addEventListener('click', () => toggleMapView());
$('crestbar').addEventListener('click', () => { if (!GS.auto) return; UI.viewF = (UI.viewF + 1) % GS.factions.length; Sfx.click(); updateHUD(); });
$('speed').addEventListener('click', (e) => { const b = e.target.closest('[data-sp]'); if (b) setSpeed(+b.dataset.sp); });
export function setSpeed(v) { if (GS.over) return; if (v > 0) UI.lastSpeed = v; GS.speed = v; Sfx.click(); updateHUD(); }

export const logItems = [];
export function log(msg, type, focus) {
  const el = document.createElement('div');
  el.className = 'ev ' + (type || 'info');
  el.innerHTML = msg;
  if (focus) el.addEventListener('click', () => focusOn(focus));
  $log.appendChild(el);
  logItems.push({ el, t: performance.now() });
  const max = phoneLayout() ? 1 : GS.auto ? 4 : 5;
  while (logItems.length > max) logItems.shift().el.remove();
}
export function updateLog() {
  const now = performance.now(), life = phoneLayout() ? 6000 : 14000;
  for (let i = logItems.length - 1; i >= 0; i--) {
    const it = logItems[i], age = now - it.t;
    it.el.classList.toggle('fade', age > life * 0.6);
    if (age > life) { it.el.remove(); logItems.splice(i, 1); }
  }
}
export let hintFlashT = 0;
export function flashHint(text) { $hint.innerHTML = text; $hint.classList.remove('hidden'); hintFlashT = performance.now() + 2600; }
export function defaultHint() {
  if (performance.now() < hintFlashT) return;
  const t = GS.auto ? (isTouch ? '<b>Autoplay</b> · tap anything to inspect it' : '<b>Autoplay</b> · click anything to inspect it · drag to take the camera · <b>F</b> to follow') : isTouch ? 'Tap your <b>army</b>, then the map: the route shows, tap again to march · Tap a <b>city</b> to recruit or build' : 'Click your <b>army</b>, then right-click where to march or what to attack · Click a <b>city</b> to recruit or build';
  if ($hint.innerHTML !== t) $hint.innerHTML = t;
}

/* ---------- simulation hooks (see game/hooks.js): what the screen shows and plays when things happen ---------- */
// Start-up wiring, run once from main.js before anything else
export function initHooks() {
  setHooks({
    battleStart: onBattleStart, battleEnd: onBattleEnd, retreated: onRetreated, cityCaptured: onCityCaptured,
    cityChanged: refreshCityMesh, fortBuilt: buildFortMesh, fortChanged: refreshFortMesh, fortRemoved: removeFortMesh,
    recruited: onRecruited, wallsDone: onWallsDone, impDone: onImpDone, armiesMerged: onArmiesMerged,
    warDeclared: onWarDeclared, peaceMade: onPeaceMade, envoy: onEnvoy, eliminated: onEliminated, warOver: onWarOver,
  });
}
export function onArmiesMerged(into, from) {
  if (UI.selEnemy === from) UI.selEnemy = into;
  if (UI.sel.includes(from)) { UI.sel = UI.sel.filter((x) => x !== from); if (!UI.sel.includes(into) && into.owner === ME) UI.sel.push(into); }
}
export function onRetreated(a, loss) { if (a.owner === ME && !GS.auto) log(`Our army <b>retreats</b>, losing ${Math.round(loss * 100)}% to the pursuit.`, 'info', a); }
export function onWarDeclared(f, g, broke) {
  const mine = !GS.auto && (f === ME || g === ME);
  log(`${fname(f)} ${broke ? 'breaks its treaty and ' : ''}declares war on ${fname(g)}.`, mine ? 'bad' : 'info');
  if (mine && g === ME) Sfx.horn();
}
export function onPeaceMade(f, g, payer, paid) {
  log(`${fname(f)} and ${fname(g)} make peace${paid ? ` · ${ownerName(payer)} pays ${paid} gold` : ''}.`, !GS.auto && (f === ME || g === ME) ? 'good' : 'info');
}
// an AI power's envoys ask the player for peace (E: GS.envoy), or leave (null)
export function onEnvoy(E) {
  const el = $('envoy');
  if (!E) { el.classList.add('hidden'); return; }
  const G = GS.factions[E.g];
  el.innerHTML = `<i style="background:${G.css}"></i><span><b>${G.name}</b> sends envoys: peace${E.gold ? `, and <b>${E.gold} gold</b> for ${pName()}` : ''}. The treaty would bind for ${mins(TREATY_TIME)} minutes.</span><button class="abtn primary" data-env="yes">Accept</button><button class="abtn" data-env="no">Refuse</button>`;
  el.classList.remove('hidden');
  log(`Envoys from ${fname(E.g)} ask for peace.`, 'info');
  Sfx.horn();
}
export const sideOf = (B, f) => (B.sides[0].faction === f ? 0 : B.sides[1].faction === f ? 1 : -1);
export function onBattleStart(B) {
  if (GS.auto && DIR.on && !DIR.busy() && DIR.hold < 1e8 && battleMen(B) > 700) DIR.hold = Math.min(DIR.hold, 0.6);
  const ps = sideOf(B, ME);
  if (ps < 0) return;
  const other = ownerName(B.sides[1 - ps].faction);
  if (B.kind === 'city' && ps === 1) { log(`<b>${B.place.name}</b> is under attack by ${other}!`, 'bad', B); Sfx.drum(); }
  else if (B.kind === 'city') log(`Our troops storm <b>${B.place.name}</b>.`, 'info', B);
  else if (ps === 1) log(`Our army is attacked by ${other}!`, 'bad', B);
  else log(`Battle joined against ${other}.`, 'info', B);
  Sfx.clang();
}
export function onScreen(x, y) { projectCell(x, y, 0, _pp); return _pp.vis && _pp.x > 0 && _pp.x < window.innerWidth && _pp.y > 0 && _pp.y < window.innerHeight; }
export let bigHitT = 0;
export function bigHitSound() { const now = performance.now(); if (now < bigHitT) return; bigHitT = now + 5000; Sfx.bigHit(); }
export function onBattleEnd(B) {
  if (GS.auto) {
    const w = B.winner, l = 1 - w;
    const wl = B.lost[w], ll = B.lost[l];
    const where = B.kind === 'city' ? ` at ${B.place.name}` : B.kind === 'fort' ? ' at a border fort' : '';
    if (wl + ll >= 500 && B.sides[w].faction >= 0) log(`<b style="color:${fcss(B.sides[w].faction)}">${ownerName(B.sides[w].faction)}</b> beat ${ownerName(B.sides[l].faction)}${where} · ${fmtInt(ll)} vs ${fmtInt(wl)} dead`, 'info', B);
    if (ll > 400 && ll > wl * 2 && onScreen(B.x, B.y)) bigHitSound();
    return;
  }
  const ps = sideOf(B, ME);
  if (ps < 0) return;
  const won = B.winner === ps;
  const ours = B.lost[ps], theirs = B.lost[1 - ps];
  const where = B.kind === 'city' ? ` at ${B.place.name}` : '';
  if (won) {
    log(`<b>Victory${where}.</b> ${fmtInt(theirs)} enemies fell, we lost ${fmtInt(ours)}.`, 'good', B);
    if (theirs > 350 && theirs > ours * 2) Sfx.bigHit();
    else Sfx.victory();
  } else {
    log(`<b>Defeat${where}.</b> We lost ${fmtInt(ours)} men, they lost ${fmtInt(theirs)}.`, 'bad', B);
    Sfx.defeat();
  }
}
export function onCityCaptured(c, prev, f) {
  const P = MAP.provinces[c.prov];
  // the province as it stands now (its owner is only updated at the next step): whole for f, or how many places are left
  const pl = placesOf(P), left = pl.filter((x) => x.ref.owner !== f).length;
  const wasWhole = prev >= 0 && pl.every((x) => x.ref === c || x.ref.owner === prev);
  if (f < 0) {
    if (prev >= 0 && (prev === ME || c.major || GS.auto)) log(`<b>${c.name}</b> rises in revolt against ${fname(prev)}.`, prev === ME && !GS.auto ? 'bad' : 'info', c);
    if (UI.selCity === c) renderPanel(true);
    return;
  }
  if (GS.auto) {
    if (c.major) {
      log(`<b style="color:${fcss(f)}">${ownerName(f)}</b> takes ${c.name}${prev >= 0 ? ` from ${ownerName(prev)}` : ''}${left ? '' : `, and with it ${P.name}`}`, prev >= 0 ? 'bad' : 'info', c);
      if (DIR.on && !DIR.busyBig() && DIR.hold < 1e8) { DIR.tgt = { kind: 'spot', x: c.x, y: c.y, d: 42 }; DIR.hold = 4; }
    }
    if (UI.selCity === c) renderPanel(true);
    return;
  }
  if (f === ME) {
    log(`<b>${c.name}</b> is ours!${left ? ` ${left} more place${left > 1 ? 's' : ''} to take in ${P.name}.` : ` The province of ${P.name} is ${pName()}'s.`}`, 'good', c);
  } else if (prev === ME) {
    log(`<b>${c.name}</b> has fallen to ${ownerName(f)}.${wasWhole ? ` ${P.name} is no longer ours alone: it is disputed.` : ''}`, 'bad', c);
  } else if (!left) log(`${ownerName(f)} took ${c.name}, and with it ${P.name}.`, 'info', c);
  if (UI.selCity === c) renderPanel(true);
}
export function onWallsDone(c) { if (c.owner === ME) log(`The walls of <b>${c.name}</b> now stand at level ${c.walls}.`, 'info', c); }
export function onRecruited(c, type, a) { const u = U(type, c.owner); if (c.owner === ME) log(`${u.n > 1 ? u.n + ' ' : ''}${u.name} mustered at ${c.name}.`, 'info', a); }
export function onEliminated(F) {
  if (F.isPlayer && !GS.auto) return;
  if (GS.auto && UI.viewF === F.id) { const nx = GS.factions.find((x) => x.alive); if (nx) UI.viewF = nx.id; }
  log(`<b>${F.name} has been wiped from the map.</b>`, 'good');
}
// the war is over (GS.over: 'win', 'lose' or 'auto'): stop the clock, forget the save, then the report
export function onWarOver() {
  GS.speed = 0;
  clearSave();
  if (GS.over === 'auto') {
    Sfx.victory();
    setFollow(false);
    CAM.tx = 0; CAM.tz = 6; CAM.td = 150;
    UI.viewF = GS.winner;
    setTimeout(showOver, 1800);
  } else {
    if (GS.over === 'win') Sfx.victory(); else Sfx.defeat();
    setTimeout(showOver, 1400);
  }
}
export function focusOn(t) { const x = t.x, y = t.y; CAM.tx = x - (MAP.W - 1) / 2; CAM.tz = y - (MAP.H - 1) / 2; if (CAM.td > 70) CAM.td = 60; }
