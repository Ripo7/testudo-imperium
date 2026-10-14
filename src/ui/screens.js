import { STAND } from '../game/standing.js';
import { GS, MAP } from '../game/state.js';
import { $, isTouch, store } from '../core/util.js';
import { Sfx } from '../core/audio.js';
import { buildWorld } from '../render/world.js';
import { CAM } from '../render/camera.js';
import { VIEW } from '../render/terrain.js';
import { buildFortMesh } from '../render/cities.js';
import { crowd, CROWD_TYPES } from '../render/crowds.js';
import { DIFFS, FACTIONS, PLAYER, SIG } from '../game/data.js';
import { initCampaign } from '../game/campaign.js';
import { resetPathfinder } from '../game/armies.js';
import { $log, $panel, $tip, clearSel, hidePopup, setME, SPECT, stopPlacing, UI } from './state.js';
import { renderPanel } from './panel.js';
import { defaultHint, focusOn, log, logItems, resetCrest, updateHUD } from './hud.js';
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
  GS.fog = !auto && UI.fog !== false;
  $('hud').classList.remove('hidden');
  showScreen(null);
  setAuto(auto);
  const cap0 = MAP.cities.find((c) => c.capital && c.owner === PLAYER);
  if (auto) {
    CAM.tx = 0; CAM.tz = 6; CAM.td = 150;
    DIR.tgt = { kind: 'spot', x: (MAP.W - 1) / 2, y: (MAP.H - 1) / 2 + 6, d: 150 }; DIR.hold = 7;
    setTimeout(() => log('<b>Autoplay.</b> The AI commands Rome, Carthage, the Gauls and Egypt. The first to hold half of the victory points wins.', 'info'), 600);
    setTimeout(() => log(isTouch ? 'Tap a power in the standings to see its treasury. Drag to take the camera.' : 'Click a power in the standings to see its treasury · drag to take the camera, press F to give it back.', 'info'), 1700);
  } else {
    focusOn(cap0); CAM.td = 48;
    UI.sel = GS.armies.filter((a) => a.owner === PLAYER);
    setTimeout(() => log(`Rome holds <b>${MAP.provinces.filter((p) => p.owner === PLAYER).map((p) => p.name).join('</b> and <b>')}</b>. Carthage, the Gauls and Egypt want the rest.`, 'info', cap0), 600);
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
  const romeAlive = GS.factions[PLAYER].alive && MAP.cities.some((c) => c.major && c.owner === PLAYER);
  const t = $('autoToggle');
  t.textContent = GS.auto ? (romeAlive ? 'Take command of Rome' : 'Rome has no city left to command') : 'Hand Rome over to the AI (autoplay)';
  t.classList.toggle('hidden', !!GS.over);
  t.disabled = GS.auto && !romeAlive; t.style.opacity = t.disabled ? 0.4 : '';
  $('newBtn').textContent = GS.auto ? 'Start a new autoplay war' : 'Start a new campaign';
  $('menu').querySelector('.tag').textContent = GS.auto ? 'The four powers hold their breath.' : 'The Senate awaits your orders.';
  showScreen('menu');
}
export function closeMenu() { showScreen(null); if (!GS.over) GS.speed = UI.menuSpeed || 1; }
export function showOver() {
  if (!GS.over || (GS.auto && !GS.factions[GS.winner])) return;   // a new campaign started meanwhile
  const s0 = Math.floor(GS.time), tstr = Math.floor(s0 / 60) + ':' + String(s0 % 60).padStart(2, '0');
  $('againBtn').textContent = GS.auto ? 'Watch another war' : 'New campaign';
  $('otherBtn').textContent = GS.auto ? 'Play as Rome instead' : 'Watch an autoplay war instead';
  if (GS.auto) {
    const W = GS.factions[GS.winner];
    const t = $('resTitle');
    t.textContent = `${W.name} wins`;
    t.className = 'res-title'; t.style.color = W.css;
    const np = MAP.provinces.filter((p) => p.owner === W.id).length;
    const fell = GS.factions.filter((F) => !F.alive).map((F) => F.name);
    $('resTag').textContent = `After ${tstr} of war, ${W.name} holds ${np} of ${MAP.provinces.length} provinces and ${GS.factions[W.id].pts} of ${STAND.total} victory points.${fell.length ? ' Wiped out: ' + fell.join(', ') + '.' : ''}`;
    $('stProv').textContent = np;
    $('stWon').textContent = GS.fstats[W.id].won;
    $('stCap').textContent = GS.fstats[W.id].captured;
    $('stTime').textContent = tstr;
    showScreen('over');
    return;
  }
  $('resTitle').style.color = '';
  const win = GS.over === 'win';
  const t = $('resTitle');
  t.textContent = win ? 'Victory' : 'Rome has fallen';
  t.className = 'res-title ' + (win ? 'win' : 'lose');
  $('resTag').textContent = win ? 'The continent kneels before the Senate and People of Rome.' : GS.rival ? `${GS.rival} now rules the continent. Another consul will try again.` : 'The eagles are lost. Another consul will try again.';
  $('stProv').textContent = MAP.provinces.filter((p) => p.owner === PLAYER).length;
  $('stWon').textContent = GS.stats.won;
  $('stCap').textContent = GS.stats.captured;
  const s = Math.floor(GS.time);
  $('stTime').textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  showScreen('over');
}
export function setMuteIcon() {
  $('muteIco').innerHTML = Sfx.muted
    ? '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9l5 6M21 9l-5 6" stroke="#fff" stroke-width="2" stroke-linecap="round"/>'
    : '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 8.5a5 5 0 0 1 0 7" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/>';
}
export function drawDiff() {
  $('diffSel').innerHTML = DIFFS.map((d, i) => `<button data-d="${i}" class="${i === UI.diff ? 'on' : ''}" title="${d.note}">${d.name}</button>`).join('')
    + `<button data-fog class="fog${UI.fog ? ' on' : ''}" title="Enemy armies are hidden outside the sight of your cities, armies and forts">Fog of war: ${UI.fog ? 'on' : 'off'}</button>`
    + `<div class="dn">Difficulty when you play Rome: ${DIFFS[UI.diff].note}${UI.fog ? ' Enemy armies are hidden outside your sight.' : ''}</div>`;
}
// Start-up wiring, run once from main.js after every module has loaded.
export function initScreens() {
  setMuteIcon();
  $('eliteHelp').innerHTML = FACTIONS.map((F, i) => `<li><b>${F.name}</b> · ${F.perk.name}: ${F.perk.desc} Elite unit, <b>${SIG[i].name}</b>: ${SIG[i].desc.replace(/^\w+ only\. /, '')}</li>`).join('');
  $('powers').innerHTML = FACTIONS.map((F, i) => `<div class="power" style="--fc:${F.css}" title="${F.perk.name}: ${F.perk.desc} ${SIG[i].desc}"><i></i>${F.name}<small>${SIG[i].name}<br>${F.perk.name}</small></div>`).join('');
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
    setAuto(on);
    log(on ? '<b>Autoplay on.</b> The AI now commands Rome as well.' : '<b>You command Rome again.</b>', 'info');
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
  $('keepBtn').addEventListener('click', () => { showScreen(null); });
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
