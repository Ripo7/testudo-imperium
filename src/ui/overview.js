import { atWar, relOf, wearyWord } from '../game/diplomacy.js';
import { cityOf, sawIt } from '../game/chronicle.js';
import { DISPUTED, holdsIn, STAND } from '../game/standing.js';
import { GS, MAP, menOf, starsOf } from '../game/state.js';
import { FACTIONS, IMPS, PEACE_TIME, RES } from '../game/data.js';
import { clock, fmtInt, fmtRate, fname, GLYPH, IC, icOf } from './format.js';
import { ME, UI } from './state.js';
import { armyStatus, headerHtml } from './panel.js';

/* =========================================================
   Overview: the state of a power (the player's, or the one followed in autoplay)
   Empire: treasury, armies, cities · Wars: who fights whom · Chronicle: what happened
   ========================================================= */
export const OVER_TABS = [['empire', 'Empire'], ['wars', 'Wars'], ['chron', 'Chronicle']];
export const CHRON_FILTERS = [['all', 'All'], ['war', 'War and peace'], ['bat', 'Battles'], ['city', 'Cities']];
export const overViewer = () => (GS.auto ? UI.viewF : ME);
const sw = (f) => `<i class="sw" style="background:${f >= 0 ? FACTIONS[f].css : '#a39d92'}"></i>`;
const adjOf = (f) => (f >= 0 ? FACTIONS[f].adj : 'militia');

/* ---------- events, as sentences ---------- */
// cat: the chronicle filter it falls under; go: what a click shows (see goTo in hud.js)
export function eventInfo(e) {
  const c = cityOf(e), cn = c ? c.name : 'the wilds';
  switch (e.k) {
    case 'war': return { cat: 'war', ico: 'swords', html: `${fname(e.f)} ${e.b ? 'breaks its treaty and declares' : 'declares'} war on ${fname(e.g)}.` };
    case 'peace': return { cat: 'war', ico: 'dove', html: `${fname(e.f)} and ${fname(e.g)} make peace${e.n ? `; ${fname(e.p)} pays ${fmtInt(e.n)} gold` : ''}.` };
    case 'fall': return { cat: 'war', ico: 'skull', html: `${fname(e.f)} is wiped from the map.` };
    case 'prov': {
      const P = MAP.provinces[e.p], go = `prov:${e.p}`;
      if (e.f >= 0) return { cat: 'city', ico: 'crown', go, html: `${fname(e.f)} wins the province of <b>${P.name}</b>${e.g >= 0 ? ` from ${fname(e.g)}` : ''}.` };
      if (e.f === DISPUTED) return { cat: 'city', ico: 'swords', go, html: e.g >= 0 ? `<b>${P.name}</b> is no longer ${fname(e.g)}'s alone: the province is disputed.` : `<b>${P.name}</b> is disputed.` };
      return { cat: 'city', ico: 'dove', go, html: `<b>${P.name}</b> is free again${e.g >= 0 ? ` of ${fname(e.g)}` : ''}.` };
    }
    case 'rev': return { cat: 'city', ico: 'unrest', html: `<b>${cn}</b> rises in revolt against ${fname(e.g)}.`, go: c ? `city:${c.id}` : null };
    case 'bat': {
      const sub = `${fmtInt(e.l[0])} ${adjOf(e.a)} and ${fmtInt(e.l[1])} ${adjOf(e.d)} dead`;
      const free = c && c.major ? 'free city' : 'free town';
      const go = e.p === 'c' && c ? `city:${c.id}` : `spot:${e.x}:${e.y}`;
      if (e.p === 'c' && e.w === 0) return { cat: 'city', ico: 'tower', go, sub, html: e.d >= 0 ? `${fname(e.a)} takes <b>${cn}</b> from ${fname(e.d)}${c && c.major ? `, and with it ${MAP.provinces[c.prov].name}` : ''}.` : `${fname(e.a)} takes the ${free} of <b>${cn}</b>.` };
      if (e.p === 'c') return { cat: 'bat', ico: 'tower', go, sub, html: e.d >= 0 ? `<b>${cn}</b> holds: ${fname(e.d)} throws back ${fname(e.a)}.` : `The ${free} of <b>${cn}</b> throws back ${fname(e.a)}.` };
      if (e.p === 't') return { cat: 'bat', ico: 'tower', go, sub, html: e.w === 0 ? `${fname(e.a)} storms a ${adjOf(e.d)} fort near <b>${cn}</b>.` : `A ${adjOf(e.d)} fort near <b>${cn}</b> holds against ${fname(e.a)}.` };
      const W = e.w === 0 ? e.a : e.d, L = e.w === 0 ? e.d : e.a;
      return { cat: 'bat', ico: 'swords', go, sub, html: `${fname(W)} defeats ${fname(L)} near <b>${cn}</b>.` };
    }
  }
  return { cat: 'war', ico: 'scroll', html: '' };
}
export const deadOf = (e) => (e.l ? e.l[0] + e.l[1] : 0);
// what power V knows of: diplomacy is public, and so is a province changing hands; the rest only if it saw it
export function knownTo(e, V) {
  if (e.k === 'war' || e.k === 'peace' || e.k === 'fall' || e.k === 'prov' || !GS.fog) return true;   // the map shows who holds a province
  if (e.k === 'bat' && (e.a === V || e.d === V)) return true;
  if (e.k === 'rev' && e.g === V) return true;
  const c = cityOf(e);
  if (e.k === 'bat' && e.p === 'c' && e.w === 0 && c && c.major) return true;
  return sawIt(e, V);
}
// small skirmishes between others are left out of 'All'
export const notable = (e, V) => (e.k === 'prov' ? e.f === V || e.g === V : e.k !== 'bat' || e.a === V || e.d === V || (e.p === 'c' && e.w === 0) || deadOf(e) >= 250);
export function eventRow(e, I) {
  const tag = I.go ? 'button' : 'div';
  return `<${tag} class="ce ${I.cat}"${I.go ? ` data-act="goto:${I.go}"` : ''}><time>${clock(e.t)}</time><i class="${I.ico}">${GLYPH[I.ico]}</i><span>${I.html}${I.sub ? `<small>${I.sub}</small>` : ''}</span></${tag}>`;
}

/* ---------- the tabs ---------- */
export function overviewPanel(tab) {
  const V = overViewer(), F = GS.factions[V];
  let h = headerHtml(F.css, `State of ${F.name}`, GS.auto ? `The power you follow, after ${clock(GS.time)} of war` : `After ${clock(GS.time)} of war`) + '<div class="pb">';
  h += '<div class="seg tabs">' + OVER_TABS.map(([k, n]) => `<button class="${k === tab ? 'on' : ''}" data-act="over:${k}">${n}</button>`).join('') + '</div>';
  h += tab === 'wars' ? warsTab(V) : tab === 'chron' ? chronTab(V) : empireTab(V);
  return h + '</div>';
}
export function cityActivity(c) {
  const bits = [];
  if (c.battle && !c.battle.done) bits.push('<em class="bad">under assault</em>');
  if (c.queue.length) bits.push('<span class="q">' + c.queue.map((q) => icOf(q.type, c.owner)).join('') + '</span>');
  if (c.wallBuild) bits.push(`<span title="Raising walls">${IC.walls} ${Math.round(c.wallBuild.t * 100)}%</span>`);
  if (c.impBuild) bits.push(`<span title="Building ${IMPS[c.impBuild.id].name}">${IMPS[c.impBuild.id].ico} ${Math.round(c.impBuild.t * 100)}%</span>`);
  if (c.loyal < 0.99) bits.push(`<span class="${c.loyal < 0.5 ? 'neg' : ''}" title="Loyalty: income and order recover over time">${Math.round(c.loyal * 100)}% loyal</span>`);
  return bits.join('');
}
export function empireTab(V) {
  const F = GS.factions[V];
  const cities = MAP.cities.filter((c) => c.owner === V), majors = cities.filter((c) => c.major).length;
  const provs = MAP.provinces.filter((p) => p.owner === V).length;
  const arms = GS.armies.filter((a) => !a.dead && a.owner === V).sort((a, b) => menOf(b.comp) - menOf(a.comp));
  const men = arms.reduce((m, a) => m + menOf(a.comp), 0);
  let h = `<div class="kv"><span class="chip">provinces <b>${provs}</b> of the ${STAND.need} that win</span><span class="chip">disputed <b>${MAP.provinces.filter((P) => P.owner === DISPUTED && holdsIn(P, V)).length}</b></span><span class="chip">cities <b>${majors}</b> and <b>${cities.length - majors}</b> towns</span><span class="chip">${IC.men}<b>${fmtInt(men)}</b> men</span></div>`;
  h += '<table class="ledger"><thead><tr><th scope="col">Per second</th><th scope="col">Stock</th><th scope="col">Income</th><th scope="col">Upkeep</th><th scope="col">Net</th></tr></thead><tbody>'
    + RES.map((r) => `<tr><th scope="row">${IC[r]}${r}</th><td>${fmtInt(F.res[r])}</td><td>+${F.inc[r].toFixed(1)}</td><td>−${F.upk[r].toFixed(1)}</td><td class="${F.net[r] < -0.05 ? 'neg' : F.net[r] > 0.05 ? 'pos' : ''}">${fmtRate(F.net[r])}</td></tr>`).join('') + '</tbody></table>';
  if (F.stretch < 0.995) h += `<div class="note">Overstretched: every income at <b>${Math.round(F.stretch * 100)}%</b>, and conquests settle slowly.</div>`;
  h += `<div class="sect">Armies · ${arms.length}</div>`;
  h += arms.length ? '<div class="list">' + arms.map((a) => `<button class="li" data-act="${GS.auto || a.owner !== ME ? 'watch' : 'selarmy'}:${a.id}"><b>${fmtInt(menOf(a.comp))}</b>${starsOf(a) ? `<span class="st">${'★'.repeat(starsOf(a))}</span>` : ''}<span class="what">${armyStatus(a)}</span>${a.state === 'battle' ? '<em class="bad">in battle</em>' : a.state === 'rout' ? '<em class="bad">routing</em>' : ''}</button>`).join('') + '</div>' : '<div class="note">No army in the field.</div>';
  const order = (c) => (c.battle && !c.battle.done ? 0 : c.capital ? 1 : c.major ? 2 : 3);
  const sorted = cities.slice().sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name));
  h += `<div class="sect">Cities · ${cities.length}</div><div class="list">` + sorted.map((c) => `<button class="li" data-act="selcity:${c.id}"><span class="cn">${c.capital ? '★ ' : ''}${c.major ? `<b>${c.name}</b>` : c.name}</span><span class="what">${cityActivity(c)}</span><em title="Militia">${fmtInt(c.militia)}</em></button>`).join('') + '</div>';
  return h;
}
export function warsTab(V) {
  const Fs = GS.factions;
  let h = '<table class="rel"><thead><tr><th></th>' + Fs.map((F) => `<th scope="col" title="${F.name}">${sw(F.id)}</th>`).join('') + '</tr></thead><tbody>';
  for (const F of Fs) {
    h += `<tr${F.id === V ? ' class="me"' : ''}><th scope="row">${sw(F.id)}${F.name}</th>`;
    for (const G of Fs) {
      if (F.id === G.id) { h += '<td class="self"></td>'; continue; }
      if (!F.alive || !G.alive) { h += '<td class="gone" title="Wiped out">–</td>'; continue; }
      const R = relOf(F.id, G.id);
      if (R.war) h += `<td class="war" title="${F.name} and ${G.name}: at war for ${clock(GS.time - R.since)}">${GLYPH.swords}<small>${clock(GS.time - R.since)}</small></td>`;
      else if (R.lock > GS.time) h += `<td class="treaty" title="${F.name} and ${G.name}: ${GS.time < PEACE_TIME ? 'opening truce' : 'treaty'}, ${clock(R.lock - GS.time)} left">${GLYPH.dove}<small>${clock(R.lock - GS.time)}</small></td>`;
      else h += `<td class="peace" title="${F.name} and ${G.name}: at peace, no treaty">·</td>`;
    }
    h += '</tr>';
  }
  h += '</tbody></table>';
  const wars = [];
  for (let f = 0; f < Fs.length; f++) for (let g = f + 1; g < Fs.length; g++) if (Fs[f].alive && Fs[g].alive && atWar(f, g)) wars.push([f, g]);
  h += `<div class="sect">${wars.length ? `Wars · ${wars.length}` : 'No war right now'}</div>`;
  for (const [f, g] of wars) {
    const R = relOf(f, g), mine = !GS.auto && (f === ME || g === ME), other = f === ME ? g : f;
    h += `<${mine ? `button data-act="dip:${other}"` : 'div'} class="wr"><div>${sw(f)}${fname(f)} and ${fname(g)}${sw(g)}<em>${clock(GS.time - R.since)}</em></div>`
      + `<small>War score <b>${Math.round(R.sc[f] || 0)}</b> to <b>${Math.round(R.sc[g] || 0)}</b>. ${FACTIONS[f].name} is ${wearyWord(R.w[f] || 0)}, ${FACTIONS[g].name} ${wearyWord(R.w[g] || 0)}.</small></${mine ? 'button' : 'div'}>`;
  }
  h += '<table class="ledger roster"><thead><tr><th scope="col">Power</th><th scope="col">Provinces</th><th scope="col">Disputed</th><th scope="col">Men</th></tr></thead><tbody>'
    + Fs.map((F) => `<tr class="${F.alive ? '' : 'dead'}${F.id === V ? ' me' : ''}"><th scope="row">${sw(F.id)}${F.name}</th><td>${F.provs}</td><td>${MAP.provinces.filter((P) => P.owner === DISPUTED && holdsIn(P, F.id)).length}</td><td>${fmtInt(GS.armies.reduce((m, a) => m + (!a.dead && a.owner === F.id ? menOf(a.comp) : 0), 0))}</td></tr>`).join('') + '</tbody></table>';
  return h;
}
export function chronTab(V) {
  const filt = UI.chronF || 'all';
  let h = '<div class="filters">' + CHRON_FILTERS.map(([k, n]) => `<button class="${k === filt ? 'on' : ''}" data-act="chf:${k}">${n}</button>`).join('') + '</div>';
  const rows = [];
  for (let i = GS.chron.length - 1; i >= 0 && rows.length < 150; i--) {
    const e = GS.chron[i];
    if (!knownTo(e, V)) continue;
    const I = eventInfo(e);
    if (filt === 'all' ? !notable(e, V) : I.cat !== filt) continue;
    rows.push(eventRow(e, I));
  }
  h += rows.length ? `<div class="chron">${rows.join('')}</div>` : `<div class="note">${GS.time < PEACE_TIME ? 'Nothing yet: the opening truce holds.' : 'Nothing of that kind so far.'}</div>`;
  if (GS.fog) h += `<div class="note">Under the fog of war, the chronicle tells what ${GS.auto ? `the scouts of ${FACTIONS[V].name}` : 'your scouts'} saw, and what all the world knows: wars, treaties, and provinces changing hands.</div>`;
  return h;
}
