import { GS } from '../game/state.js';
import { simStep } from '../game/sim.js';
import { TURN_TIME } from '../game/data.js';
import { beginTurn, turnEndOf, turnOf, turnStartOf } from '../game/turns.js';
import { $ } from '../core/util.js';
import { Sfx } from '../core/audio.js';
import { dateOf } from './format.js';
import { cancelOrder, idleArmies, SPEED0, UI, worldRuns } from './state.js';
import { focusOn, updateHUD } from './hud.js';
import { renderPanel } from './panel.js';
import { saveGame } from './persist.js';

/* =========================================================
   Turns on screen
   UI.phase 'orders': the world waits while the player gives orders (the AI powers have made their plans: game/turns.js).
   'play': End turn plays the turn out for everyone at once, at the chosen speed (it can be paused, or skipped to its
   end), and the world stops again when the turn is over, with a report of what happened. Autoplay ends its turns itself.
   ========================================================= */
export const AUTO_WAIT = 0.7;   // seconds autoplay lingers between two turns
/** The player is done with their orders: the turn plays out. */
export function endTurn() {
  if (UI.mode !== 'play' || GS.over || UI.phase === 'play') return false;
  beginTurn();   // a no-op when the AI has already planned this turn (it does at the end of the one before)
  UI.phase = 'play'; UI.sliceEnd = turnEndOf(GS.time); UI.autoAt = 0;
  if (GS.speed <= 0) GS.speed = UI.lastSpeed || SPEED0;
  cancelOrder(); hideTurnReport(); UI.news = [];
  if (!GS.auto) Sfx.click();
  updateHUD(); renderPanel(true);
  return true;
}
/** Play the rest of the turn at once. */
export function skipTurn() {
  if (UI.phase !== 'play' || GS.over) return;
  while (!GS.over && GS.time < UI.sliceEnd - 1e-6) simStep(Math.min(0.1, UI.sliceEnd - GS.time));
  finishTurn();
}
/** From the frame loop: advance the turn that is playing, and stop at its end; autoplay starts the next by itself. */
export function advanceTurn(rawDt) {
  if (worldRuns()) {
    let s = Math.min(0.25, rawDt) * GS.speed;
    while (s > 1e-4 && !GS.over && GS.time < UI.sliceEnd - 1e-6) { const st = Math.min(0.1, s, UI.sliceEnd - GS.time); simStep(st); s -= st; }
    if (GS.over || GS.time >= UI.sliceEnd - 1e-6) finishTurn();
  }
  if (GS.auto && UI.mode === 'play' && UI.phase === 'orders' && !GS.over && GS.speed > 0) {
    const now = performance.now();
    if (!UI.autoAt) UI.autoAt = now + AUTO_WAIT * 1000;
    if (now >= UI.autoAt) endTurn();
  }
}
/** The turn has played out: the AI plans the next one, the player is back to giving orders. */
export function finishTurn() {
  if (UI.phase !== 'play') return;
  UI.phase = 'orders';
  if (GS.over) { updateHUD(); renderPanel(true); return; }
  beginTurn();
  if (GS.auto) UI.autoAt = performance.now() + AUTO_WAIT * 1000;
  else { showTurnReport(); Sfx.drum(true); }
  saveGame();
  updateHUD(); renderPanel(true);
}
/** Where a campaign starts or resumes: between two turns, or partway through one (a save made while it played). */
export function enterTurns() {
  UI.news = []; UI.autoAt = 0;
  hideTurnReport();
  if (GS.time > turnStartOf(GS.time) + 0.05) { UI.phase = 'play'; UI.sliceEnd = turnEndOf(GS.time); }
  else { UI.phase = 'orders'; beginTurn(); }
}
// how far the turn has played, on the bars that show it (every frame)
export let turnBarW = '';
export function updateTurnBar() {
  const f = UI.phase === 'play' && !GS.over ? Math.min(1, Math.max(0, 1 - (UI.sliceEnd - GS.time) / TURN_TIME)) : 0;
  const w = (f * 100).toFixed(1) + '%';
  if (w === turnBarW) return;
  turnBarW = w;
  $('turnProg').style.width = w; $('dkProg').style.width = w;
}

/* ---------- the report at the end of a turn: what the dispatches told while it played ---------- */
export const NEWS_MAX = 7;
// the hud's log hands every dispatch of a playing turn here (UI.news); the report shows the most telling first
export function noteNews(msg, type, focus) { if (UI.phase === 'play' && !GS.auto) UI.news.push({ msg, type, focus }); }
export function showTurnReport() {
  const el = $('turnrep'), rank = { bad: 0, good: 1, info: 2 };
  const news = UI.news.slice().sort((a, b) => (rank[a.type] ?? 3) - (rank[b.type] ?? 3));
  const n = turnOf(GS.time) - 1, idle = idleArmies();
  let h = `<div class="trh"><b>Turn ${n} is over</b><small>${dateOf(GS.time - 1)}</small><button class="x" data-tr="close" aria-label="Close the report">✕</button></div>`;
  h += news.length ? `<div class="trl">${news.slice(0, NEWS_MAX).map((e, i) => `<div class="ev ${e.type || 'info'}${e.focus ? ' go' : ''}" data-tr="${i}">${e.msg}</div>`).join('')}${news.length > NEWS_MAX ? `<div class="more">${news.length - NEWS_MAX} more in the Overview's chronicle</div>` : ''}</div>`
    : '<div class="quiet">A quiet turn: no news from the provinces.</div>';
  h += `<div class="trf">${idle ? `<b>${idle}</b> ${idle > 1 ? 'armies wait' : 'army waits'} for orders. ` : ''}Turn ${n + 1}, ${dateOf(GS.time)}: give your orders, then <b>End turn</b>.</div>`;
  el.innerHTML = h;
  // under the envoys, while they wait for an answer
  const env = $('envoy');
  el.style.top = env.classList.contains('hidden') ? '' : `${Math.round(env.getBoundingClientRect().bottom + 8)}px`;
  el.classList.remove('hidden');
  document.body.classList.add('has-turnrep');
  UI.reportNews = news;
}
export function hideTurnReport() { $('turnrep').classList.add('hidden'); document.body.classList.remove('has-turnrep'); }
// the End turn button (Enter): ends the turn between turns, skips to its end while it plays
export function turnButton() {
  if (UI.mode !== 'play' || GS.over) return;
  if (UI.phase === 'play') skipTurn(); else endTurn();
}
// Start-up wiring, run once from main.js
export function initTurns() {
  $('turnrep').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tr]'); if (!b) return;
    if (b.dataset.tr === 'close') { hideTurnReport(); Sfx.click(); return; }
    const it = UI.reportNews && UI.reportNews[+b.dataset.tr];
    if (it && it.focus && !it.focus.dead) focusOn(it.focus);
  });
  $('endTurn').addEventListener('click', () => turnButton());
}
