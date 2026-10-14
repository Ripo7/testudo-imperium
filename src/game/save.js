import { updateSight } from './sight.js';
import { updateStanding } from './standing.js';
import { emptyComp, GS, MAP } from './state.js';
import { $, store } from '../core/util.js';
import { Sfx } from '../core/audio.js';
import { CAM } from '../render/camera.js';
import { VIEW } from '../render/terrain.js';
import { FACTIONS, PEACE_TIME, PLAYER, pName, setPlayer } from './data.js';
import { initCampaign } from './campaign.js';
import { findPath } from './armies.js';
import { setME, SPECT, UI } from '../ui/state.js';
import { renderPanel } from '../ui/panel.js';
import { log, updateHUD } from '../ui/hud.js';
import { setAuto, showScreen } from '../ui/screens.js';
import { togglePolitical } from '../ui/director.js';
import { fillStats } from './chronicle.js';

/* =========================================================
   Save & resume (kept in this browser only)
   The map is rebuilt from its seed; everything that changes during
   a campaign is stored, with objects referenced by id.
   ========================================================= */
export const SAVE_KEY = 'testudo.save.v1';
export const MOVE_RULES = 2;   // 2: roads, bridges and fords
export const clockStr = (t) => { const s = Math.floor(t); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
export function mapPrint() { return [MAP.W, MAP.H, MAP.provinces.length, MAP.cities.length, MAP.landCount].join('x'); }
export function canResume() { return !!MAP && GS.factions.length > 0 && !UI.fresh && !GS.over; }
export function serializeGame() {
  const playing = UI.mode === 'play';
  const refOf = (T) => {
    if (!T || !T.ref) return null;
    if (T.kind === 'city') return { k: 'city', id: T.ref.id };
    return T.ref.dead ? null : { k: T.kind, id: T.ref.id };
  };
  return {
    v: 1, mv: MOVE_RULES, seed: MAP.seed, print: mapPrint(), at: Date.now(),
    gs: {
      time: GS.time, auto: GS.auto, player: PLAYER, rel: GS.rel, diff: GS.diff, fog: !!GS.fog, nextId: GS.nextId, stats: GS.stats, fstats: GS.fstats, checkT: GS.checkT, chron: GS.chron, hist: GS.hist,
      speed: playing ? (GS.speed || UI.menuSpeed || UI.helpSpeed || UI.lastSpeed || 1) : (UI.resumeSpeed || 1),
    },
    factions: GS.factions.map((F) => ({ res: F.res, inc: F.inc, upk: F.upk, net: F.net, alive: F.alive, starving: F.starving, unpaid: F.unpaid, aiT: F.aiT, eliminatedAt: F.eliminatedAt, provoked: F.provoked, oath: F.oath, noDealT: F.noDealT, intel: F.intel || {} })),
    prov: MAP.provinces.map((p) => p.owner),
    cities: MAP.cities.map((c) => ({ im: c.imps, ib: c.impBuild, o: c.owner, w: c.walls, wb: c.wallBuild, q: c.queue, cap: c.capital, l: c.loyal, m: c.militia, mm: c.militiaMax })),
    forts: GS.forts.filter((f) => !f.dead).map((f) => ({ id: f.id, o: f.owner, x: f.x, y: f.y, b: f.built, m: f.militia })),
    armies: GS.armies.filter((a) => !a.dead).map((a) => ({
      id: a.id, o: a.owner, comp: a.comp, x: a.x, y: a.y, h: a.heading, path: a.path, pi: a.pi, tg: refOf(a.target),
      st: a.stance, s: a.state, rt: a.routT, w: a.wins, rp: a.repathT, ac: a.aiCommit, ps: a.preState, lt: a.lostT,
    })),
    battles: GS.battles.filter((B) => !B.done).map((B) => ({
      id: B.id, kind: B.kind, place: B.place ? B.place.id : null, x: B.x, y: B.y, round: B.round, t: B.t, luck: B.luck, startMen: B.startMen,
      terrainDef: B.terrainDef, rough: B.rough, river: B.river, dugIn: B.dugIn, flank: B.flank,
      sides: B.sides.map((S) => ({ f: S.faction, a: S.armies.filter((a) => !a.dead).map((a) => a.id), m: S.militia ? { men: S.militia.men, sp: S.militia.sp } : null, start: S.start, l: S.left || 0 })),
    })),
    view: playing ? { x: CAM.tx, z: CAM.tz, d: CAM.td, pol: VIEW.political } : (UI.resumeView ? Object.assign({ pol: UI.resumePolitical }, UI.resumeView) : null),
  };
}
export function restoreGame(S) {
  initCampaign(S.seed);
  if (mapPrint() !== S.print || S.cities.length !== MAP.cities.length) throw new Error('This save belongs to a different map.');
  const g = S.gs;
  Object.assign(GS, { time: g.time, rel: g.rel || oldRelations(g), diff: g.diff == null ? 1 : g.diff, fog: !!g.fog, auto: !!g.auto, nextId: g.nextId, stats: g.stats, fstats: fillStats(g.fstats), chron: g.chron || [], hist: g.hist || [], checkT: g.checkT || 1, armies: [], forts: [], battles: [], over: null });
  setPlayer(g.player || 0);   // saves from before any power was playable: Rome
  setME(GS.auto ? SPECT : PLAYER);
  S.factions.forEach((d, i) => Object.assign(GS.factions[i], d));
  for (const F of GS.factions) F.isPlayer = false;
  GS.factions[PLAYER].isPlayer = !GS.auto;
  MAP.provinces.forEach((p, i) => { p.owner = S.prov[i]; });
  MAP.cities.forEach((c, i) => {
    const d = S.cities[i];
    Object.assign(c, { imps: d.im || [], impBuild: d.ib || null, owner: d.o, walls: d.w, wallBuild: d.wb, queue: d.q || [], capital: d.cap, loyal: d.l, militia: d.m, militiaMax: d.mm, battle: null });
  });
  updateStanding();
  const forts = new Map(), armies = new Map();
  for (const d of S.forts) {
    const f = { id: d.id, owner: d.o, x: d.x, y: d.y, built: d.b, militia: d.m, dead: false, battle: null };
    GS.forts.push(f); forts.set(f.id, f);
  }
  for (const d of S.armies) {
    const a = {
      id: d.id, owner: d.o, comp: Object.assign(emptyComp(), d.comp), x: d.x, y: d.y, heading: d.h || 0,
      path: d.path || null, pi: d.pi || 0, pathVersion: 1, target: null, stance: d.st, state: d.s, routT: d.rt || 0, wins: d.w || 0,
      battle: null, dead: false, repathT: d.rp || 0, layout: null, layoutKey: '', lastPos: { x: d.x, y: d.y },
    };
    if (d.ac != null) a.aiCommit = d.ac;
    if (d.lt != null) a.lostT = d.lt;
    if (d.ps) a.preState = d.ps;
    GS.armies.push(a); armies.set(a.id, a);
  }
  for (const d of S.armies) {
    if (!d.tg) continue;
    const ref = d.tg.k === 'city' ? MAP.cities[d.tg.id] : d.tg.k === 'fort' ? forts.get(d.tg.id) : armies.get(d.tg.id);
    if (ref) { const ar = armies.get(d.id); ar.target = { kind: d.tg.k, ref, hostile: (d.tg.k === 'city' || d.tg.k === 'fort') && ref.owner >= 0 && ref.owner !== ar.owner }; }
  }
  for (const d of S.battles) {
    const place = d.kind === 'city' ? MAP.cities[d.place] : d.kind === 'fort' ? forts.get(d.place) : null;
    if (d.kind !== 'field' && !place) continue;
    const B = {
      id: d.id, kind: d.kind, place, x: d.x, y: d.y, round: d.round, t: d.t, done: false, luck: d.luck, startMen: d.startMen,
      terrainDef: d.terrainDef, rough: d.rough, river: d.river, dugIn: d.dugIn, flank: d.flank,
    };
    B.sides = d.sides.map((s) => ({ faction: s.f, armies: s.a.map((id) => armies.get(id)).filter(Boolean), militia: s.m ? { men: s.m.men, sp: s.m.sp, ref: place } : null, start: s.start, left: s.l || 0 }));
    if (!B.sides[0].armies.length) continue;   // the attackers are gone: nothing left to fight
    for (const side of B.sides) for (const a of side.armies) { a.state = 'battle'; a.battle = B; }
    if (place) place.battle = B;
    GS.battles.push(B);
  }
  for (const a of GS.armies) if (a.state === 'battle' && !a.battle) a.state = 'idle';
  for (const F of GS.factions) F.intel = F.intel || {};
  GS.sightT = 0; updateSight(false);
  // saves from before roads, bridges and fords: re-plan marches, which may cross rivers that are now closed
  if ((S.mv || 1) < MOVE_RULES) for (const a of GS.armies) if (a.path && a.path.length) { const end = a.path[a.path.length - 1]; a.path = findPath(a.x, a.y, end % MAP.W, (end / MAP.W) | 0, a.owner); a.pi = 0; if (!a.path && a.state === 'move') a.state = 'idle'; }
  UI.resumeSpeed = g.speed || 1;
  UI.resumeView = S.view ? { x: S.view.x, z: S.view.z, d: S.view.d } : null;
  UI.resumePolitical = S.view ? !!S.view.pol : false;
}
// saves from before the war/peace model: everyone past the truce was at war, except pairs under a pact
export function oldRelations(g) {
  const rel = {};
  for (let f = 0; f < 4; f++) for (let h = f + 1; h < 4; h++) {
    const pact = g.pacts && g.pacts[f + '-' + h] > g.time;
    rel[f + '-' + h] = g.time >= PEACE_TIME && !pact ? { war: true, since: g.time - 120, lock: 0, w: {}, sc: {}, nd: {} } : { war: false, since: 0, lock: pact ? g.pacts[f + '-' + h] : PEACE_TIME, w: {}, sc: {}, nd: {} };
  }
  return rel;
}
export function saveGame() { if (canResume()) store.set(SAVE_KEY, serializeGame()); }
export function loadSave() { const s = store.get(SAVE_KEY, null); return s && s.v === 1 && s.seed != null && s.gs && Array.isArray(s.armies) ? s : null; }
export function clearSave() { store.del(SAVE_KEY); }
export function resumeInfo() {
  const N = MAP.provinces.length, t = clockStr(GS.time);
  if (!GS.auto) return `${pName()} holds ${MAP.provinces.filter((p) => p.owner === PLAYER).length} of ${N} provinces · ${t} of war`;
  const counts = GS.factions.map((F) => MAP.provinces.filter((p) => p.owner === F.id).length);
  const lead = counts.indexOf(Math.max(...counts));
  return `Autoplay war · ${FACTIONS[lead].name} leads with ${counts[lead]} of ${N} · ${t}`;
}
export function showTitle() {
  const can = canResume();
  $('contBtn').classList.toggle('hidden', !can);
  if (can) $('contInfo').textContent = resumeInfo();
  $('startBtn').classList.toggle('alt', can);
  const pick = FACTIONS[UI.pick || 0];
  $('startBtn').innerHTML = can ? `New campaign<small>Play as ${pick.name} on a fresh continent</small>` : `Play as ${pick.name}<small>Pick your power above</small>`;
  $('autoBtn').innerHTML = can ? 'Autoplay<small>Watch a new war between four AI empires</small>' : 'Autoplay<small>Watch four AI empires fight it out</small>';
  showScreen('title');
}
export function resumeCampaign() {
  if (!canResume()) return;
  Sfx.init(); Sfx.click();
  UI.mode = 'play';
  $('hud').classList.remove('hidden');
  showScreen(null);
  setAuto(GS.auto);
  const v = UI.resumeView;
  if (v) { CAM.tx = v.x; CAM.tz = v.z; CAM.td = v.d; }
  if (!!UI.resumePolitical !== VIEW.political) togglePolitical();
  GS.speed = UI.resumeSpeed || 1; UI.lastSpeed = GS.speed;
  log(`<b>Campaign resumed</b> after ${clockStr(GS.time)} of war.`, 'info');
  updateHUD(); renderPanel(true);
  saveGame();
  Sfx.horn();
}
