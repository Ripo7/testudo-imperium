import { SET_W } from './standing.js';
import { GS, MAP, menOf, ownerName } from './state.js';
import { $ } from '../core/util.js';
import { Sfx } from '../core/audio.js';
import { FACTIONS, GANG_AT, hasImp, NEUTRAL, OATH_TIME, PACT_TIME, PEACE_TIME, PEACE_WILL, PLAYER, pName, REVOLT_RATE, TREATY_TIME, TRIBUTE_FLOOR } from './data.js';
import { captureCity, powerOf, roundComp } from './battles.js';
import { fcss } from '../ui/format.js';
import { ME, UI } from '../ui/state.js';
import { log } from '../ui/hud.js';
import { clockStr } from './save.js';
import { recordPeace, recordWar } from './chronicle.js';

// Diplomacy: every pair of powers is either at war or at peace. A peace treaty binds both sides for a while;
// after it lapses they stay at peace until one of them declares war. Wars wear powers down until they make peace.
export const pairKey = (f, g) => (f < g ? f + '-' + g : g + '-' + f);
export function relOf(f, g) {
  const k = pairKey(f, g);
  return GS.rel[k] || (GS.rel[k] = { war: false, since: 0, lock: PEACE_TIME, w: {}, sc: {}, nd: {} });
}
export const atWar = (f, g) => f >= 0 && g >= 0 && f !== g && !!(GS.rel && GS.rel[pairKey(f, g)] && GS.rel[pairKey(f, g)].war);
export const atPeace = (f, g) => f >= 0 && g >= 0 && f !== g && !atWar(f, g);
export const treatyOn = (f, g) => atPeace(f, g) && relOf(f, g).lock > GS.time;
export function warsOf(f) { let n = 0; for (const G of GS.factions) if (G.alive && atWar(f, G.id)) n++; return n; }
export function armyPower(f) { let p = 0; for (const a of GS.armies) if (!a.dead && a.owner === f) p += powerOf(a.comp, f); return p; }
export const mins = (sec) => (sec % 60 === 30 ? Math.floor(sec / 60) + '½' : String(Math.round(sec / 60)));
export const fname = (f) => `<b style="color:${fcss(f)}">${ownerName(f)}</b>`;
export function declareWar(f, g, quiet) {
  const R = relOf(f, g);
  if (R.war) return;
  const broke = R.lock > GS.time;
  Object.assign(R, { war: true, since: GS.time, lock: 0, w: { [f]: 0, [g]: 0 }, sc: { [f]: 0, [g]: 0 } });
  if (broke) GS.factions[f].oath = GS.time + OATH_TIME;
  recordWar(f, g, broke);
  if (UI.envoy && (UI.envoy.g === f || UI.envoy.g === g)) hideEnvoy();
  if (quiet) return;
  const mine = !GS.auto && (f === ME || g === ME);
  log(`${fname(f)} ${broke ? 'breaks its treaty and ' : ''}declares war on ${fname(g)}.`, mine ? 'bad' : 'info');
  if (mine && g === ME) Sfx.horn();
}
export function makePeace(f, g, dur, payer, gold) {
  const R = relOf(f, g);
  let paid = 0;
  if (payer != null && gold > 0) { const P = GS.factions[payer], Q = GS.factions[payer === f ? g : f]; paid = Math.max(0, Math.min(gold, Math.floor(P.res.gold))); P.res.gold -= paid; Q.res.gold += paid; }
  Object.assign(R, { war: false, since: GS.time, lock: GS.time + dur });
  recordPeace(f, g, payer, paid);
  for (const B of GS.battles) {
    if (B.done || !((B.sides[0].faction === f && B.sides[1].faction === g) || (B.sides[0].faction === g && B.sides[1].faction === f))) continue;
    B.done = true; B.endT = GS.time; B.winner = -1;
    for (const S of B.sides) for (const a of S.armies) { a.battle = null; a.state = 'idle'; roundComp(a); if (menOf(a.comp) < 5 && a.comp.siege < 1) a.dead = true; }
    if (B.place) B.place.battle = null;
  }
  for (const a of GS.armies) {
    if (a.dead || !a.target || (a.owner !== f && a.owner !== g)) continue;
    const o = a.target.ref && a.target.ref.owner;
    if ((a.target.kind === 'army' || a.target.kind === 'city' || a.target.kind === 'fort') && (o === f || o === g) && o !== a.owner) { a.target = null; a.path = null; if (a.state === 'move') a.state = 'idle'; a.aiCommit = 0; }
  }
  if (UI.envoy && (UI.envoy.g === f || UI.envoy.g === g)) hideEnvoy();
  log(`${fname(f)} and ${fname(g)} make peace${paid ? ` · ${ownerName(payer)} pays ${paid} gold` : ''}.`, !GS.auto && (f === ME || g === ME) ? 'good' : 'info');
}
// how ready power f is to end its war with g (above PEACE_WILL: wants peace)
export function peaceWill(f, g) {
  const F = GS.factions[f], G = GS.factions[g], R = relOf(f, g);
  const r = (armyPower(f) + 50) / (armyPower(g) + 50);
  let w = (R.w[f] || 0) + 0.1 - 0.35 * F.aggr;
  w += 0.3 * Math.max(0, 1 - r) - 0.2 * Math.max(0, Math.min(2.5, r) - 1);   // the weaker side wants out, the stronger presses on
  w += 0.15 * Math.max(0, warsOf(f) - 1);                                      // fighting on several fronts
  w += Math.max(-0.3, Math.min(0.3, ((R.sc[g] || 0) - (R.sc[f] || 0)) * 0.04));   // who is winning
  if (F.starving || F.unpaid) w += 0.2;
  if (G.share > GANG_AT && F.share < G.share) w -= 0.25;   // nobody lightly makes peace with a runaway leader
  if (GS.time - R.since < 150) w -= 0.5;                    // a war just begun is not given up
  if (R.lc && R.lc[f] > GS.time - 60) w -= 0.3;             // still taking cities: press on
  return w;
}
export const tributeFor = (will) => Math.min(600, Math.max(50, Math.round((PEACE_WILL - will) * 1200 / 25) * 25));
export const wearyWord = (w) => (w < 0.25 ? 'fresh' : w < 0.5 ? 'tiring' : w < 0.8 ? 'war-weary' : 'exhausted');
// the player offers peace to g: { ok, gold (the player pays), why }
export function peaceAnswer(g) {
  const P = GS.factions[PLAYER], G = GS.factions[g], R = relOf(PLAYER, g);
  if ((R.nd[g] || 0) > GS.time) return { ok: false, why: `${G.name} will not receive your envoys again so soon.` };
  if (P.oath > GS.time) return { ok: false, why: `${G.name} does not trust an oath-breaker.` };
  if (GS.time - R.since < 150) return { ok: false, why: `The war has only begun: ${G.name} wants to fight it out first.` };
  const w = peaceWill(g, PLAYER);
  if (w > PEACE_WILL) return { ok: true, gold: 0, why: `${G.name} is ready for peace.` };
  if (w > TRIBUTE_FLOOR) return { ok: true, gold: tributeFor(w), why: `${G.name} will make peace for a tribute.` };
  return { ok: false, why: GS.time - R.since < 150 ? `The war has only begun: ${G.name} wants to fight it out first.` : P.share > GANG_AT && G.share < P.share ? `${G.name} sees ${pName()} as the threat that must be stopped.` : `${G.name} thinks it is winning and refuses.` };
}
export function suePeace(g) {
  const a = peaceAnswer(g), P = GS.factions[PLAYER];
  if (!a.ok) { UI.dipMsg = a.why; return false; }
  if (a.gold > P.res.gold) { UI.dipMsg = `${a.why} It asks <b>${a.gold} gold</b>, more than the treasury holds.`; return false; }
  makePeace(PLAYER, g, TREATY_TIME, a.gold ? PLAYER : null, a.gold);
  UI.dipMsg = `Peace with ${FACTIONS[g].name}${a.gold ? ` for ${a.gold} gold` : ''}. The treaty binds both sides for ${mins(TREATY_TIME)} minutes.`;
  return true;
}
// at peace: will g renew the treaty with the player?
export function treatyAnswer(g) {
  const P = GS.factions[PLAYER], G = GS.factions[g], R = relOf(PLAYER, g);
  if ((R.nd[g] || 0) > GS.time) return { ok: false, why: `${G.name} will not receive your envoys again so soon.` };
  if (P.oath > GS.time) return { ok: false, why: `${G.name} does not trust an oath-breaker.` };
  if (P.share > GANG_AT && G.share < P.share) return { ok: false, why: `${G.name} sees ${pName()} as the threat that must be stopped.` };
  const r = (armyPower(g) + 50) / (armyPower(PLAYER) + 50);
  if (warsOf(g) === 0 && r > 1.9 - 0.6 * G.aggr) return { ok: false, why: `${G.name} has its eye on your lands and refuses.` };
  return { ok: true, why: `${G.name} agrees.` };
}
export function renewTreaty(g) {
  const a = treatyAnswer(g), R = relOf(PLAYER, g);
  if (!a.ok) { R.nd[g] = GS.time + 45; UI.dipMsg = a.why; return false; }
  R.lock = Math.max(R.lock, GS.time) + PACT_TIME;
  UI.dipMsg = `${FACTIONS[g].name} renews the treaty: it now binds for ${clockStr(R.lock - GS.time)}.`;
  return true;
}
// an AI power looks for a war worth fighting
export function aiConsiderWar(F) {
  if (F.starving || F.unpaid) return;
  const mine = MAP.cities.filter((c) => c.owner === F.id);
  if (!mine.length) return;
  const wars = warsOf(F.id), maxW = F.aggr > 0.75 ? 2 : 1;
  const myPow = armyPower(F.id);
  const roomToGrow = MAP.cities.some((c) => c.owner === NEUTRAL && mine.some((m) => Math.hypot(m.x - c.x, m.y - c.y) < 28));
  let best = null, bs = 0;
  for (const G of GS.factions) {
    if (!G.alive || G.id === F.id || atWar(F.id, G.id) || relOf(F.id, G.id).lock > GS.time) continue;   // the AI keeps its treaties
    const vsLeader = G.share > GANG_AT && F.share < G.share;
    if (wars >= maxW + (vsLeader ? 1 : 0)) continue;
    const r = (myPow + 50) / (armyPower(G.id) + 50);
    if (r < (vsLeader ? 0.65 : 0.95)) continue;
    let val = 0;
    for (const c of MAP.cities) if (c.owner === G.id) { const d = Math.min(...mine.map((m) => Math.hypot(m.x - c.x, m.y - c.y))); if (d < 32) val += SET_W(c) / (1 + d / 12); }
    if (val <= 0) continue;
    const sc = val * Math.min(r, 2) * (vsLeader ? 1.8 : 1) * (G.isPlayer ? 1 + 0.2 * F.aggr : 1);
    if (sc > bs) { bs = sc; best = G; }
  }
  if (best && Math.random() < (0.12 + 0.3 * F.aggr) * (roomToGrow ? 0.35 : 1) * (wars ? 0.5 : 1)) declareWar(F.id, best.id);
}
export function dipTick() {
  // every war wears both sides down: time, hunger and other fronts
  for (const k in GS.rel) {
    const R = GS.rel[k]; if (!R.war) continue;
    for (const x of k.split('-').map(Number)) {
      const X = GS.factions[x]; if (!X.alive) continue;
      R.w[x] = (R.w[x] || 0) + 0.0012 * (1.25 - 0.5 * X.aggr) + (X.starving || X.unpaid ? 0.003 : 0) + 0.0006 * Math.max(0, warsOf(x) - 1);
    }
  }
  revolts();
  if (UI.envoy && (GS.time > UI.envoy.until || !atWar(PLAYER, UI.envoy.g) || GS.auto)) { if (GS.time > UI.envoy.until) relOf(PLAYER, UI.envoy.g).nd[PLAYER] = GS.time + 60; hideEnvoy(); }
  if (GS.time < PEACE_TIME) return;
  const ai = GS.factions.filter((F) => F.alive && !F.isPlayer);
  for (const F of ai) { F.dipT = (F.dipT == null ? Math.random() * 10 : F.dipT) - 1; if (F.dipT <= 0) { F.dipT = 8 + Math.random() * 6; aiConsiderWar(F); } }
  GS.peaceT = (GS.peaceT || 0) - 1;
  if (GS.peaceT > 0) return;
  GS.peaceT = 6;
  // AI powers at war settle when both are ready, the readier one paying if the other must be bought
  for (let i = 0; i < ai.length; i++) for (let j = i + 1; j < ai.length; j++) {
    const f = ai[i].id, g = ai[j].id;
    if (!atWar(f, g)) continue;
    const wf = peaceWill(f, g), wg = peaceWill(g, f);
    if (wf > PEACE_WILL && wg > PEACE_WILL) makePeace(f, g, TREATY_TIME);
    else if (wf > PEACE_WILL && wg > TRIBUTE_FLOOR && ai[i].res.gold >= tributeFor(wg) * 0.6) makePeace(f, g, TREATY_TIME, f, tributeFor(wg));
    else if (wg > PEACE_WILL && wf > TRIBUTE_FLOOR && ai[j].res.gold >= tributeFor(wf) * 0.6) makePeace(f, g, TREATY_TIME, g, tributeFor(wf));
  }
  // AI envoys come to the player
  if (!GS.auto && !UI.envoy && GS.factions[PLAYER].alive && UI.mode === 'play') {
    for (const G of ai) {
      const R = relOf(PLAYER, G.id);
      if (!atWar(PLAYER, G.id) || (R.nd[PLAYER] || 0) > GS.time) continue;
      const w = peaceWill(G.id, PLAYER);
      if (w <= PEACE_WILL + 0.1) continue;
      const gold = w > 0.75 && (R.sc[PLAYER] || 0) > (R.sc[G.id] || 0) + 3 ? Math.min(300, Math.round((w - 0.6) * 600 / 25) * 25 + 50) : 0;
      showEnvoy(G.id, gold);
      break;
    }
  }
}
// disloyal cities of a stretched empire, with no garrison and no temple, may rise in revolt
// chance per second that a disloyal city with no garrison and no temple revolts
export const revoltRisk = (c, F) => (0.5 - c.loyal) * REVOLT_RATE * (F.stretch < 0.995 ? 1 + (1 - F.stretch) * 5 : 0.5);
export function revolts() {
  for (const c of MAP.cities) {
    if (c.owner < 0 || c.capital || c.loyal >= 0.5 || hasImp(c, 'temple') || (c.battle && !c.battle.done)) continue;
    const F = GS.factions[c.owner];
    if (GS.armies.some((a) => !a.dead && a.owner === c.owner && Math.abs(a.x - c.x) < 3 && Math.abs(a.y - c.y) < 3)) continue;
    if (Math.random() < revoltRisk(c, F)) { captureCity(c, NEUTRAL); c.militia = c.militiaMax * 0.6; c.loyal = 1; }
  }
}
export function showEnvoy(g, gold) {
  UI.envoy = { g, gold, until: GS.time + 40 };
  const G = GS.factions[g];
  $('envoy').innerHTML = `<i style="background:${G.css}"></i><span><b>${G.name}</b> sends envoys: peace${gold ? `, and <b>${gold} gold</b> for ${pName()}` : ''}. The treaty would bind for ${mins(TREATY_TIME)} minutes.</span><button class="abtn primary" data-env="yes">Accept</button><button class="abtn" data-env="no">Refuse</button>`;
  $('envoy').classList.remove('hidden');
  log(`Envoys from ${fname(g)} ask for peace.`, 'info');
  Sfx.horn();
}
export function hideEnvoy() { UI.envoy = null; const e = document.getElementById('envoy'); if (e) e.classList.add('hidden'); }
