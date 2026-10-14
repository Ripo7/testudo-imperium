import { atWar, relOf, revoltRisk, treatyOn } from '../game/diplomacy.js';
import { knowsArmy } from '../game/sight.js';
import { STAND } from '../game/standing.js';
import { GS, MAP, menOf } from '../game/state.js';
import { FACTIONS, hasImp, PEACE_TIME } from '../game/data.js';
import { sideMen } from '../game/battles.js';
import { plunderer } from '../game/economy.js';
import { nearestCity } from '../game/armies.js';
import { clock, fmt, GLYPH } from './format.js';

/* =========================================================
   Dispatches: what needs the attention of power V right now.
   The chronicle says what happened; a dispatch lasts as long as its cause.
   go: what a click opens ('battle:id', 'city:id', 'army:id', 'prov:id', 'over:tab', 'dip:f')
   ========================================================= */
export const SEV_ORDER = { bad: 0, warn: 1, good: 2, info: 3 };
export const NEAR_CITY = 8;        // an enemy army this close to a city is a threat to it
export const RUNWAY = 90;          // warn when food or gold runs out within this many seconds
export const NEAR_VICTORY = 6;     // warn when a power is this many points from victory
export const UNREST_RISK = 0.03;   // warn when a city's chance of revolt passes 3% a minute

export function computeAlerts(V) {
  const out = [], F = GS.factions[V];
  if (!F || !F.alive) return out;
  const add = (sev, ico, text, val, go, title) => out.push({ sev, ico, text, val: val || '', go, title: title || '' });
  // battles this power is fighting
  const busy = new Set();
  for (const B of GS.battles) {
    if (B.done) continue;
    const si = B.sides[0].faction === V ? 0 : B.sides[1].faction === V ? 1 : -1;
    if (si < 0) continue;
    const ours = sideMen(B.sides[si]), theirs = sideMen(B.sides[1 - si]);
    const val = `${fmt(ours)} vs ${fmt(theirs)}`, tt = `${FACTIONS[V].name}: ${Math.round(ours)} men, the enemy: ${Math.round(theirs)}`;
    const go = `battle:${B.id}`;
    if (B.kind === 'city') busy.add(B.place.id);
    const near = B.kind === 'city' ? B.place : nearestCity(B.x, B.y);
    if (si === 1 && B.kind === 'city') add('bad', 'tower', `<b>${B.place.name}</b> under assault`, val, go, tt);
    else if (si === 1 && B.kind === 'fort') add('bad', 'tower', `Fort near <b>${near.name}</b> under assault`, val, go, tt);
    else if (B.kind === 'city') add('info', 'swords', `Storming <b>${B.place.name}</b>`, val, go, tt);
    else if (B.kind === 'fort') add('info', 'swords', `Storming a fort near <b>${near.name}</b>`, val, go, tt);
    else add('warn', 'swords', `Battle near <b>${near.name}</b>`, val, go, tt);
  }
  // enemy armies it can see closing on its cities (the largest first, one per city)
  const mine = MAP.cities.filter((c) => c.owner === V);
  const threats = [];
  for (const a of GS.armies) {
    if (a.dead || a.owner === V || a.owner < 0 || a.state === 'battle' || a.state === 'rout' || !atWar(V, a.owner) || !knowsArmy(V, a)) continue;
    let best = null, bd = NEAR_CITY;
    for (const c of mine) { if (busy.has(c.id)) continue; const d = Math.hypot(c.x - a.x, c.y - a.y); if (d < bd) { bd = d; best = c; } }
    if (best) threats.push({ a, c: best, men: menOf(a.comp) });
  }
  threats.sort((x, y) => y.men - x.men);
  const threatened = new Set();
  for (const t of threats) {
    if (threatened.has(t.c.id) || threatened.size >= 2) continue;
    threatened.add(t.c.id);
    const onIt = t.a.target && t.a.target.ref === t.c;
    add(onIt ? 'bad' : 'warn', 'march', `${FACTIONS[t.a.owner].adj} army ${onIt ? 'marching on' : 'near'} <b>${t.c.name}</b>`, `${fmt(t.men)} men`, `army:${t.a.id}`);
  }
  // its provinces plundered
  let pl = 0;
  for (const p of new Set(mine.map((c) => c.prov))) {
    const a = plunderer(p, V);
    if (a && pl++ < 2) add('warn', 'flame', `<b>${MAP.provinces[p].name}</b> plundered`, `by ${FACTIONS[a.owner].name}`, `prov:${p}`, 'Enemy troops loose in the province: its land income falls by 60%');
  }
  // food and gold
  const runway = (r) => (F.net[r] < -0.05 ? F.res[r] / -F.net[r] : Infinity);
  if (F.starving) add('bad', 'grain', 'Granaries empty: armies starve', '', 'over:empire');
  else if (runway('food') < RUNWAY) add('warn', 'grain', 'Food runs out', clock(runway('food')), 'over:empire', `Spending ${(-F.net.food).toFixed(1)} food a second more than comes in`);
  if (F.unpaid) add('bad', 'coin', 'Treasury empty: soldiers desert', '', 'over:empire');
  else if (runway('gold') < RUNWAY) add('warn', 'coin', 'Gold runs out', clock(runway('gold')), 'over:empire', `Spending ${(-F.net.gold).toFixed(1)} gold a second more than comes in`);
  // unrest in conquered cities with no garrison and no temple
  const risk = (c) => (c.capital || c.loyal >= 0.5 || hasImp(c, 'temple') || GS.armies.some((a) => !a.dead && a.owner === V && Math.abs(a.x - c.x) < 3 && Math.abs(a.y - c.y) < 3) ? 0 : revoltRisk(c, F) * 60);
  const restless = mine.map((c) => [c, risk(c)]).filter(([, r]) => r >= UNREST_RISK).sort((a, b) => b[1] - a[1]);
  if (restless.length) {
    const [w, r] = restless[0];
    add('warn', 'unrest', restless.length === 1 ? `Unrest in <b>${w.name}</b>` : `Unrest in ${restless.length} cities`, `${Math.round(r * 100)}%/min`, `city:${w.id}`, `${w.name} may revolt (about ${Math.round(r * 100)}% a minute): station troops there or build a temple`);
  }
  // the race for victory
  const need = STAND.need;
  for (const G of GS.factions) if (G.alive && G.id !== V && G.pts >= need - NEAR_VICTORY) add('bad', 'crown', `<b>${G.name}</b> nears victory`, `${G.pts}/${need}`, GS.auto ? 'over:wars' : `dip:${G.id}`);
  if (F.pts >= need - NEAR_VICTORY) add('good', 'crown', 'Victory is within reach', `${F.pts}/${need}`, 'over:empire');
  // truce and treaties running out
  if (GS.time < PEACE_TIME) add('info', 'dove', 'Opening truce', `${clock(PEACE_TIME - GS.time)} left`, 'over:wars', 'Nobody fights until it ends, unless someone strikes first');
  else for (const G of GS.factions) {
    if (!G.alive || G.id === V || !treatyOn(V, G.id)) continue;
    const left = relOf(V, G.id).lock - GS.time;
    if (left < 30) add('info', 'dove', `Treaty with <b>${G.name}</b> ends`, clock(left), GS.auto ? 'over:wars' : `dip:${G.id}`);
  }
  return out.sort((a, b) => SEV_ORDER[a.sev] - SEV_ORDER[b.sev]);
}
export function alertsHtml(list, max) {
  const shown = list.slice(0, max);
  let h = shown.map((a) => `<button class="al ${a.sev}" data-go="${a.go}"${a.title ? ` title="${a.title}"` : ''}><i>${GLYPH[a.ico]}</i><span>${a.text}</span>${a.val ? `<em>${a.val}</em>` : ''}</button>`).join('');
  if (list.length > max) h += `<button class="al more" data-go="over:empire"><span>+${list.length - max} more</span></button>`;
  return h;
}
// Each war's state between f and g at a glance, for the standings
export const warsList = () => {
  const out = [];
  for (let f = 0; f < GS.factions.length; f++) for (let g = f + 1; g < GS.factions.length; g++) {
    if (!GS.factions[f].alive || !GS.factions[g].alive) continue;
    if (atWar(f, g)) out.push({ f, g, war: true, t: GS.time - relOf(f, g).since });
    else if (treatyOn(f, g) && GS.time >= PEACE_TIME) out.push({ f, g, war: false, t: relOf(f, g).lock - GS.time });
  }
  return out.sort((a, b) => (b.war - a.war) || (b.t - a.t));
};
