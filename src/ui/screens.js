import { updateSight } from '../game/sight.js';
import { STAND } from '../game/standing.js';
import { GS, MAP } from '../game/state.js';
import { $, isTouch, store } from '../core/util.js';
import { Sfx } from '../core/audio.js';
import { buildWorld } from '../render/world.js';
import { CAM } from '../render/camera.js';
import { VIEW } from '../render/terrain.js';
import { buildFortMesh } from '../render/cities.js';
import { crowd, CROWD_TYPES } from '../render/crowds.js';
import { DIFFS, FACTIONS, othersOf, PLAYER, pName, setPlayer, SIG, VOICE } from '../game/data.js';
import { initCampaign } from '../game/campaign.js';
import { resetPathfinder } from '../game/armies.js';
import { $log, $panel, $tip, clearSel, hidePopup, setME, SPECT, stopPlacing, UI } from './state.js';
import { renderPanel } from './panel.js';
import { applyPanels, defaultHint, focusOn, goTo, log, logItems, PANELS, resetCrest, updateHUD } from './hud.js';
import { chartHover, chartLeave, renderReport, REP } from './report.js';
import { clock } from './format.js';
import { buildMapLabels } from './labels.js';
import { restoreGame, resumeCampaign, saveGame, showTitle } from '../game/save.js';
import { DIR, setFollow, togglePolitical } from './director.js';

/* =========================================================
   Screens & flow
   ========================================================= */
export const screens = { title: $('title'), menu: $('menu'), help: $('help'), over: $('over') };
export function showScreen(name) { for (const k in screens) screens[k].classList.toggle('hidden', k !== name); }
export function prepareCampaign(seed, save) {
  $('loading').classList.remove('hidden');
  $('overbar').classList.add('hidden');
  if (save) restoreGame(save); else initCampaign(seed);
  UI.fresh = !save;
  resetPathfinder();
  buildWorld();
  for (const f of GS.forts) buildFortMesh(f);
  for (const t of CROWD_TYPES) crowd[t].count = 0;
  buildMapLabels();
  clearSel();
  $panel.innerHTML = ''; UI.lastPanel = '';
  $log.innerHTML = ''; logItems.length = 0;
  const cap0 = MAP.cities.find((c) => c.capital && c.owner === PLAYER) || MAP.cities.find((c) => c.capital);
  CAM.x = CAM.tx = cap0.x - (MAP.W - 1) / 2; CAM.z = CAM.tz = cap0.y - (MAP.H - 1) / 2 + 4; CAM.d = CAM.td = 140;
  $('loading').classList.add('hidden');
}
export function setAuto(on) {
  GS.auto = on; setME(on ? SPECT : PLAYER);
  GS.factions[PLAYER].isPlayer = !on;
  document.body.classList.toggle('auto', on);
  if (UI.placing) stopPlacing();
  clearSel(); hidePopup(); $tip.classList.add('hidden');
  UI.viewF = PLAYER;
  if (!GS.factions[PLAYER].alive) { const nx = GS.factions.find((x) => x.alive); if (nx) UI.viewF = nx.id; }
  $('btnFollow').classList.toggle('hidden', !on);
  setFollow(on);
  resetCrest();
  updateHUD(); renderPanel(true); defaultHint();
}
export function startCampaign(auto) {
  auto = auto === true;
  Sfx.init(); Sfx.click();
  UI.mode = 'play'; UI.fresh = false;
  GS.speed = auto ? 2 : 1; UI.lastSpeed = GS.speed;
  GS.diff = auto ? 1 : (UI.diff == null ? 1 : UI.diff);
  GS.fog = UI.fog !== false;   // the AI plays under the fog too; in autoplay you watch through one power's eyes
  if (!auto) setPlayer(UI.pick || 0);
  for (const F of GS.factions) F.isPlayer = false;
  if (GS.time < 1) for (const a of GS.armies) a.stance = !auto && a.owner === PLAYER ? 'aggr' : 'def';
  GS.sightT = 0; updateSight();
  $('hud').classList.remove('hidden');
  showScreen(null);
  setAuto(auto);
  const cap0 = MAP.cities.find((c) => c.capital && c.owner === PLAYER);
  if (auto) {
    CAM.tx = 0; CAM.tz = 6; CAM.td = 150;
    DIR.tgt = { kind: 'spot', x: (MAP.W - 1) / 2, y: (MAP.H - 1) / 2 + 6, d: 150 }; DIR.hold = 7;
    setTimeout(() => log(`<b>Autoplay.</b> The AI commands all four powers. The first to hold half of the victory points wins.${GS.fog ? ' You watch through the eyes of the power picked in the standings.' : ''}`, 'info'), 600);
    setTimeout(() => log(isTouch ? 'Tap a power in the standings to follow it. Drag to take the camera.' : 'Click a power in the standings to follow it · drag to take the camera, press F to give it back.', 'info'), 1700);
  } else {
    focusOn(cap0); CAM.td = 48;
    UI.sel = GS.armies.filter((a) => a.owner === PLAYER);
    setTimeout(() => log(`${pName()} holds <b>${MAP.provinces.filter((p) => p.owner === PLAYER).map((p) => p.name).join('</b> and <b>')}</b>. ${othersOf(PLAYER)} want the rest.`, 'info', cap0), 600);
    setTimeout(() => log(isTouch ? 'Your army is selected: tap a neutral city nearby to see your odds and attack.' : 'Your army is selected: right-click a neutral city nearby to attack it. Hover first to see the odds.', 'info'), 1600);
  }
  updateHUD(); renderPanel(true);
  saveGame();
  Sfx.drum(); setTimeout(() => Sfx.drum(), 380); setTimeout(() => Sfx.horn(), 800);
}
export function newCampaign(auto) {
  showScreen(null);
  $('loading').classList.remove('hidden');
  setTimeout(() => { prepareCampaign((Math.random() * 1e9) | 0); startCampaign(auto === true); }, 40);
}
export function openMenu() {
  if (UI.mode !== 'play') return;
  UI.menuSpeed = GS.speed; GS.speed = 0;
  saveGame();
  // in autoplay you can take command of the power you are following
  const who = GS.auto ? UI.viewF : PLAYER, W = FACTIONS[who];
  const canLead = GS.factions[who].alive && MAP.cities.some((c) => c.major && c.owner === who);
  const t = $('autoToggle');
  t.textContent = GS.auto ? (canLead ? `Take command of ${W.name}` : `${W.name} has no city left to command`) : `Hand ${W.name} over to the AI (autoplay)`;
  t.classList.toggle('hidden', !!GS.over);
  t.disabled = GS.auto && !canLead; t.style.opacity = t.disabled ? 0.4 : '';
  $('newBtn').textContent = GS.auto ? 'Start a new autoplay war' : 'Start a new campaign';
  $('menu').querySelector('.tag').textContent = GS.auto ? 'The four powers hold their breath.' : VOICE[PLAYER].court;
  showScreen('menu');
}
export function closeMenu() { showScreen(null); if (!GS.over) GS.speed = UI.menuSpeed || 1; }
export function showOver() {
  if (!GS.over || (GS.auto && !GS.factions[GS.winner])) return;   // a new campaign started meanwhile
  const tstr = clock(GS.time), N = MAP.provinces.length;
  $('againBtn').textContent = GS.auto ? 'Watch another war' : 'New campaign';
  $('otherBtn').textContent = GS.auto ? `Play as ${FACTIONS[UI.pick || 0].name} instead` : 'Watch an autoplay war instead';
  const t = $('resTitle');
  const fell = GS.factions.filter((F) => !F.alive).map((F) => F.name);
  const fellTxt = fell.length ? ` Wiped out: ${fell.join(', ')}.` : '';
  if (GS.auto) {
    const W = GS.factions[GS.winner];
    t.textContent = `${W.name} wins`;
    t.className = 'res-title'; t.style.color = W.css;
    $('resTag').textContent = `After ${tstr} of war, ${W.name} holds ${MAP.provinces.filter((p) => p.owner === W.id).length} of ${N} provinces and ${W.pts} of ${STAND.total} victory points.${fellTxt}`;
  } else {
    const win = GS.over === 'win';
    t.style.color = '';
    t.textContent = win ? 'Victory' : `${pName()} has fallen`;
    t.className = 'res-title ' + (win ? 'win' : 'lose');
    $('resTag').textContent = (win ? VOICE[PLAYER].win : GS.rival ? `${GS.rival} now rules the continent. Another ${VOICE[PLAYER].leader} will try again.` : `${VOICE[PLAYER].lost} Another ${VOICE[PLAYER].leader} will try again.`) + ` The war lasted ${tstr}.`;
  }
  $('overbar').classList.add('hidden');
  showScreen('over');
  REP.all = false;
  renderReport();
  screens.over.scrollTop = 0;
}
export function setMuteIcon() {
  $('muteIco').innerHTML = Sfx.muted
    ? '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9l5 6M21 9l-5 6" stroke="#fff" stroke-width="2" stroke-linecap="round"/>'
    : '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 8.5a5 5 0 0 1 0 7" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/>';
}
// the four powers on the title screen: pick the one you will play
export function drawPowers() {
  $('powers').innerHTML = FACTIONS.map((F, i) => `<button class="power${i === (UI.pick || 0) ? ' on' : ''}" data-pick="${i}" style="--fc:${F.css}" title="${F.perk.name}: ${F.perk.desc} ${SIG[i].desc}"><i></i>${F.name}<small>${SIG[i].name}<br>${F.perk.name}</small></button>`).join('');
}
// the pause menu's switches for the floating panels
export function drawShowOpts() {
  $('showOpts').innerHTML = '<span>On screen</span>' + PANELS.map(([k, n]) => `<button data-show="${k}" class="${UI.show[k] !== false ? 'on' : ''}" aria-pressed="${UI.show[k] !== false}">${n}</button>`).join('')
    + '<p>The eye in the top bar hides them all at once, to clear the map.</p>';
}
export function drawDiff() {
  $('diffSel').innerHTML = DIFFS.map((d, i) => `<button data-d="${i}" class="${i === UI.diff ? 'on' : ''}" title="${d.note}">${d.name}</button>`).join('')
    + `<button data-fog class="fog${UI.fog ? ' on' : ''}" title="Enemy armies are hidden outside the sight of your cities, armies and forts">Fog of war: ${UI.fog ? 'on' : 'off'}</button>`
    + `<div class="dn">Difficulty when you play: ${DIFFS[UI.diff].note}${UI.fog ? ' Every power, the AI included, only sees what its cities, armies and forts can see.' : ''}</div>`;
}
// Start-up wiring, run once from main.js after every module has loaded.
export function initScreens() {
  setMuteIcon();
  $('eliteHelp').innerHTML = FACTIONS.map((F, i) => `<li><b>${F.name}</b> · ${F.perk.name}: ${F.perk.desc} Elite unit, <b>${SIG[i].name}</b>: ${SIG[i].desc.replace(/^\w+ only\. /, '')}</li>`).join('');
  UI.pick = store.get('testudo.faction', 0);
  drawPowers();
  $('powers').addEventListener('click', (e) => { const b = e.target.closest('[data-pick]'); if (!b) return; UI.pick = +b.dataset.pick; store.set('testudo.faction', UI.pick); Sfx.click(); drawPowers(); showTitle(); });
  UI.show = Object.assign({ stand: true, alerts: true, log: true, hint: true }, store.get('testudo.show', {}));
  UI.mapView = !!store.get('testudo.mapView', false);
  drawShowOpts(); applyPanels();
  $('showOpts').addEventListener('click', (e) => {
    const b = e.target.closest('[data-show]'); if (!b) return;
    UI.show[b.dataset.show] = UI.show[b.dataset.show] === false;
    store.set('testudo.show', UI.show);
    Sfx.click(); drawShowOpts(); applyPanels();
  });
  UI.diff = store.get('testudo.diff', 1);
  UI.fog = store.get('testudo.fog', true);
  $('diffSel').addEventListener('click', (e) => {
    const f = e.target.closest('[data-fog]');
    if (f) { UI.fog = !UI.fog; store.set('testudo.fog', UI.fog); Sfx.click(); drawDiff(); return; }
    const b = e.target.closest('[data-d]'); if (b) { UI.diff = +b.dataset.d; store.set('testudo.diff', UI.diff); Sfx.click(); drawDiff(); }
  });
  drawDiff();
  $('startBtn').addEventListener('click', () => { if (UI.fresh) startCampaign(false); else newCampaign(false); });
  $('autoBtn').addEventListener('click', () => { if (UI.fresh) startCampaign(true); else newCampaign(true); });
  $('contBtn').addEventListener('click', resumeCampaign);
  $('autoToggle').addEventListener('click', () => {
    if ($('autoToggle').disabled) return;
    Sfx.click();
    const on = !GS.auto;
    if (!on) setPlayer(UI.viewF);   // take command of the power being followed
    setAuto(on);
    log(on ? `<b>Autoplay on.</b> The AI now commands ${pName()} as well.` : `<b>You command ${pName()}.</b>`, 'info');
    closeMenu();
  });
  $('resumeBtn').addEventListener('click', () => { Sfx.click(); closeMenu(); });
  $('newBtn').addEventListener('click', () => { Sfx.click(); newCampaign(GS.auto); });
  $('quitBtn').addEventListener('click', () => {
    Sfx.click();
    saveGame();
    UI.resumeSpeed = UI.menuSpeed || UI.lastSpeed || 1;
    UI.resumeView = { x: CAM.tx, z: CAM.tz, d: CAM.td };
    UI.resumePolitical = VIEW.political;
    UI.mode = 'title'; setFollow(false); $('hud').classList.add('hidden'); showTitle();
  });
  $('againBtn').addEventListener('click', () => { Sfx.click(); newCampaign(GS.auto); });
  $('otherBtn').addEventListener('click', () => { Sfx.click(); newCampaign(!GS.auto); });
  $('btnMap').addEventListener('click', () => { Sfx.click(); togglePolitical(); });
  $('btnFollow').addEventListener('click', () => { Sfx.click(); setFollow(!DIR.on); });
  $('keepBtn').addEventListener('click', () => { showScreen(null); $('overbar').classList.remove('hidden'); });
  $('reportBtn').addEventListener('click', () => { Sfx.click(); showOver(); });
  // the report: table views, every event, a click on an event shows the place on the map, the crosshair on the charts
  const rep = $('report');
  rep.addEventListener('click', (e) => {
    const tb = e.target.closest('[data-tbl]');
    if (tb) { REP.table[tb.dataset.tbl] = !REP.table[tb.dataset.tbl]; Sfx.click(); renderReport(); return; }
    if (e.target.closest('[data-allev]')) { REP.all = !REP.all; Sfx.click(); renderReport(); return; }
    const ev = e.target.closest('[data-act^="goto:"]');
    if (ev) { showScreen(null); $('overbar').classList.remove('hidden'); goTo(ev.dataset.act.slice(5)); }
  });
  const hover = (e) => { const svg = e.target.closest && e.target.closest('svg.ch'); if (svg) chartHover(svg.closest('[data-chart]').dataset.chart, svg, e.clientX); };
  rep.addEventListener('pointermove', hover);
  // a touch shows the values until the next touch elsewhere; a mouse shows them while it is over the chart
  rep.addEventListener('pointerdown', (e) => { hover(e); if (!(e.target.closest && e.target.closest('svg.ch'))) rep.querySelectorAll('svg.ch').forEach(chartLeave); });
  rep.addEventListener('pointerout', (e) => { const svg = e.target.closest && e.target.closest('svg.ch'); if (svg && e.pointerType === 'mouse' && !svg.contains(e.relatedTarget)) chartLeave(svg); });
  window.addEventListener('resize', () => { if (!screens.over.classList.contains('hidden')) renderReport(); });
  $('btnHelp').addEventListener('click', () => { UI.helpSpeed = GS.speed; GS.speed = 0; showScreen('help'); });
  $('helpClose').addEventListener('click', () => { showScreen(null); if (!GS.over) GS.speed = UI.helpSpeed || 1; });
  $('btnMenu').addEventListener('click', openMenu);
  $('btnMute').addEventListener('click', () => { Sfx.init(); Sfx.toggle(); setMuteIcon(); });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    if (UI.mode === 'play' && GS.speed > 0 && !GS.over) openMenu();
    else saveGame();
  });
  window.addEventListener('pagehide', saveGame);
}
