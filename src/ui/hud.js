import { atWar, fname, hideEnvoy, makePeace, relOf, treatyOn, warsOf } from '../game/diplomacy.js';
import { STAND } from '../game/standing.js';
import { GS, MAP, menOf, ownerName } from '../game/state.js';
import { $, isTouch } from '../core/util.js';
import { Sfx } from '../core/audio.js';
import { CAM, projectCell } from '../render/camera.js';
import { FACTIONS, PEACE_TIME, PLAYER, pName, RES, TREATY_TIME, U } from '../game/data.js';
import { sideMen } from '../game/battles.js';
import { fcss, fmt, fmtInt, fmtRate, IC } from './format.js';
import { _pp, $hint, $log, clearSel, ME, UI } from './state.js';
import { renderPanel } from './panel.js';
import { showOver } from './screens.js';
import { clearSave } from '../game/save.js';
import { battleMen, DIR, setFollow } from './director.js';

/* =========================================================
   HUD: resources, standings, log
   ========================================================= */
export const $res = $('resbar');
$res.innerHTML = RES.map((r) => `<div class="res" id="r_${r}" title="${r}">${IC[r]}<div><b>0</b><br><small>+0</small></div></div>`).join('');
export const resEls = RES.map((r) => { const el = $('r_' + r); return { el, b: el.querySelector('b'), s: el.querySelector('small') }; });
export let crestKey = '';
export function resetCrest() { crestKey = ''; }
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
  const need = STAND.need;
  let h = `<h4>The powers${GS.auto ? ', all AI' : ''}</h4>`;
  if (GS.auto && GS.fog) h += `<div class="note" style="margin:-2px 0 4px;font-size:11.5px">Seen through the eyes of <b style="color:${FACTIONS[UI.viewF].css}">${FACTIONS[UI.viewF].name}</b> · click a power to switch</div>`;
  let lead = null, leadN = -1;
  for (const Fx of GS.factions) {
    const prov = Fx.pts;
    if (prov > leadN) { leadN = prov; lead = Fx; }
    const men = GS.armies.reduce((m, a) => m + (!a.dead && a.owner === Fx.id ? menOf(a.comp) : 0), 0);
    const view = GS.auto && Fx.id === UI.viewF;
    h += `<div class="row${Fx.alive ? '' : ' dead'}${view ? ' view' : ''}"${GS.auto || (!Fx.isPlayer && Fx.alive) ? ` data-f="${Fx.id}"` : ''}><i class="sw" style="background:${Fx.css}"></i><span class="nm">${Fx.name}${!GS.auto && Fx.isPlayer ? ' (you)' : ''}${relMark(Fx)}${Fx.alive && Fx.stretch < 0.995 ? ` <small class="over" title="Overstretched: income at ${Math.round(Fx.stretch * 100)}%">−${Math.round((1 - Fx.stretch) * 100)}%</small>` : ''}</span><b title="victory points: major city 3, town 1">${prov}</b><span>${fmt(men)}</span></div>`;
  }
  if (GS.time < PEACE_TIME) { const l = Math.ceil(PEACE_TIME - GS.time); h += `<div class="note" style="margin:4px 0 0;font-size:11.5px">Truce: ${Math.floor(l / 60)}:${String(l % 60).padStart(2, '0')} left, or until someone strikes first.</div>`; }
  if (GS.auto) h += `<div id="goal">Leader: <b style="color:${lead.css}">${lead.name}</b> ${leadN}/${need} pts<div class="gbar"><i style="width:${Math.min(100, leadN / need * 100)}%;background:${lead.css}"></i></div></div>`;
  else {
    const mine = GS.factions[ME].pts;
    h += `<div id="goal">Victory points: <b>${mine}/${need}</b><div class="gbar"><i style="width:${Math.min(100, mine / need * 100)}%"></i></div></div>`;
  }
  const st = $('standRows');
  if (st.innerHTML !== h) st.innerHTML = h;
}
$('envoy').addEventListener('click', (e) => {
  const b = e.target.closest('[data-env]'); if (!b || !UI.envoy) return;
  const E = UI.envoy;
  if (b.dataset.env === 'yes' && atWar(PLAYER, E.g)) { makePeace(PLAYER, E.g, TREATY_TIME, E.gold ? E.g : null, E.gold); Sfx.horn(); }
  else { relOf(PLAYER, E.g).nd[PLAYER] = GS.time + 90; log(`${pName()} sends the envoys of ${fname(E.g)} home.`, 'info'); Sfx.click(); }
  hideEnvoy(); updateHUD(); renderPanel(true);
});
$('standRows').addEventListener('pointerdown', (e) => { const r = e.target.closest('[data-f]'); if (r && !GS.auto) { clearSel(true); UI.selDip = +r.dataset.f; UI.dipMsg = ''; Sfx.click(); renderPanel(true); } else if (r && GS.auto) { UI.viewF = +r.dataset.f; Sfx.click(); updateHUD(); } });
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
  const max = isTouch ? 3 : GS.auto ? 4 : 6;
  while (logItems.length > max) logItems.shift().el.remove();
}
export function updateLog() {
  const now = performance.now(), life = isTouch ? 7000 : 14000;
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
  const t = GS.auto ? (isTouch ? '<b>Autoplay</b> · tap anything to inspect it' : '<b>Autoplay</b> · click anything to inspect it · drag to take the camera · <b>F</b> to follow') : isTouch ? 'Tap your <b>army</b>, then tap where to march · Tap a <b>city</b> to recruit or build' : 'Click your <b>army</b>, then right-click where to march or what to attack · Click a <b>city</b> to recruit or build';
  if ($hint.innerHTML !== t) $hint.innerHTML = t;
}

/* ---------- simulation hooks ---------- */
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
  const wf = B.sides[B.winner] ? B.sides[B.winner].faction : -1;
  if (wf >= 0) GS.fstats[wf].won++;
  if (GS.auto) {
    const w = B.winner, l = 1 - w;
    const wl = Math.max(0, B.startMen[w] - sideMen(B.sides[w])), ll = Math.max(0, B.startMen[l] - sideMen(B.sides[l]));
    const where = B.kind === 'city' ? ` at ${B.place.name}` : B.kind === 'fort' ? ' at a border fort' : '';
    if (wl + ll >= 500 && B.sides[w].faction >= 0) log(`<b style="color:${fcss(B.sides[w].faction)}">${ownerName(B.sides[w].faction)}</b> beat ${ownerName(B.sides[l].faction)}${where} · ${fmtInt(ll)} vs ${fmtInt(wl)} dead`, 'info', B);
    if (ll > 400 && ll > wl * 2 && onScreen(B.x, B.y)) bigHitSound();
    return;
  }
  const ps = sideOf(B, ME);
  if (ps < 0) return;
  GS.stats.battles++;
  const won = B.winner === ps;
  const ours = Math.max(0, B.startMen[ps] - sideMen(B.sides[ps]));
  const theirs = Math.max(0, B.startMen[1 - ps] - sideMen(B.sides[1 - ps]));
  const where = B.kind === 'city' ? ` at ${B.place.name}` : '';
  if (won) {
    GS.stats.won++;
    log(`<b>Victory${where}.</b> ${fmtInt(theirs)} enemies fell, we lost ${fmtInt(ours)}.`, 'good', B);
    if (theirs > 350 && theirs > ours * 2) Sfx.bigHit();
    else Sfx.victory();
  } else {
    GS.stats.lost++;
    log(`<b>Defeat${where}.</b> We lost ${fmtInt(ours)} men, they lost ${fmtInt(theirs)}.`, 'bad', B);
    Sfx.defeat();
  }
}
export function onCityCaptured(c, prev, f) {
  const P = MAP.provinces[c.prov];
  if (f < 0) {
    if (prev >= 0 && (prev === ME || c.major || GS.auto)) log(`<b>${c.name}</b> rises in revolt against ${fname(prev)}.`, prev === ME && !GS.auto ? 'bad' : 'info', c);
    if (UI.selCity === c) renderPanel(true);
    return;
  }
  if (f >= 0) GS.fstats[f].captured++;
  if (GS.auto) {
    if (c.major) {
      log(`<b style="color:${fcss(f)}">${ownerName(f)}</b> takes ${c.name}${prev >= 0 ? ` from ${ownerName(prev)}` : ''} · ${P.name} changes hands`, prev >= 0 ? 'bad' : 'info', c);
      if (DIR.on && !DIR.busyBig() && DIR.hold < 1e8) { DIR.tgt = { kind: 'spot', x: c.x, y: c.y, d: 42 }; DIR.hold = 4; }
    }
    if (UI.selCity === c) renderPanel(true);
    return;
  }
  if (f === ME) {
    GS.stats.captured++;
    log(`<b>${c.name}</b> is ours!${c.major ? ` The province of ${P.name} bows to ${pName()}.` : ''}`, 'good', c);
  } else if (prev === ME) {
    log(`<b>${c.name}</b> has fallen to ${ownerName(f)}.${c.major ? ` The province of ${P.name} is lost.` : ''}`, 'bad', c);
  } else if (c.major) log(`${ownerName(f)} took ${c.name} (${P.name}).`, 'info', c);
  if (UI.selCity === c) renderPanel(true);
}
export function onWallsDone(c) { if (c.owner === ME) log(`The walls of <b>${c.name}</b> now stand at level ${c.walls}.`, 'info', c); }
export function onRecruited(c, type, a) { const u = U(type, c.owner); if (c.owner === ME) log(`${u.n > 1 ? u.n + ' ' : ''}${u.name} mustered at ${c.name}.`, 'info', a); }
export function onEliminated(F) {
  if (F.isPlayer && !GS.auto) return;
  if (GS.auto && UI.viewF === F.id) { const nx = GS.factions.find((x) => x.alive); if (nx) UI.viewF = nx.id; }
  log(`<b>${F.name} has been wiped from the map.</b>`, 'good');
}
export function endCampaign(win) {
  GS.over = win ? 'win' : 'lose';
  GS.speed = 0;
  clearSave();
  if (win) Sfx.victory(); else Sfx.defeat();
  setTimeout(showOver, 1400);
}
export function endAuto(W) {
  GS.over = 'auto'; GS.winner = W.id;
  GS.speed = 0;
  clearSave();
  Sfx.victory();
  setFollow(false);
  CAM.tx = 0; CAM.tz = 6; CAM.td = 150;
  UI.viewF = W.id;
  setTimeout(showOver, 1800);
}
export function focusOn(t) { const x = t.x, y = t.y; CAM.tx = x - (MAP.W - 1) / 2; CAM.tz = y - (MAP.H - 1) / 2; if (CAM.td > 70) CAM.td = 60; }
