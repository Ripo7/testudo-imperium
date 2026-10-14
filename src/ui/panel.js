import { groundInfo, mergeArmies, orderTarget, splitArmy } from '../game/armies.js';
import { seesArmy, seesBattle, seesCity } from '../game/sight.js';
import { atWar, declareWar, mins, peaceAnswer, relOf, renewTreaty, suePeace, treatyAnswer, wearyWord } from '../game/diplomacy.js';
import { provSecure, provW, SET_W } from '../game/standing.js';
import { canAfford, dist, emptyComp, GS, MAP, menOf, ownerName, provAt, starsOf } from '../game/state.js';
import { isTouch } from '../core/util.js';
import { Sfx } from '../core/audio.js';
import { BIOME } from '../map/generate.js';
import { BASE_SPEED, FACTIONS, FORT_MAX, FORT_WALLS, fortCost, hasImp, IMP_IDS, impCost, IMPS, impSlots, MARKET, OATH_TIME, PACT_TIME, pAdj, PEACE_TIME, perkOf, PLAYER, PLUNDER, pName, RES, sigOf, TYPES5, U, unitCost, UNITS, wallCost } from '../game/data.js';
import { canRetreat, estimateOdds, modsList, retreatArmy, retreatLoss, sideMen } from '../game/battles.js';
import { armyPay, buildImp, cityYield, fortify, landShare, marketOf, plunderer, recruit, trade } from '../game/economy.js';
import { costHtml, costMini, fcss, fmt, fmtInt, IC, icOf } from './format.js';
import { $hint, $panel, clearSel, issueOrder, ME, myOrderables, oddsHtml, startPlacing, UI } from './state.js';
import { flashHint, focusOn, goTo, log, phoneLayout, updateHUD } from './hud.js';
import { overviewPanel } from './overview.js';
import { updateTerrainColors } from '../render/terrain.js';
import { clockStr } from '../game/save.js';
import { DIR, setFollow } from './director.js';

export const releaseHold = () => setTimeout(() => { UI.hold = false; }, 150);
export function doAct(act) {
  const F = GS.factions[ME];
  const [cmd, arg] = act.split(':');
  const c = UI.selCity;
  if (cmd === 'goto') { goTo(act.slice(5)); return; }
  if (GS.auto && !['close', 'focus', 'follow', 'view', 'over', 'chf', 'watch', 'selcity', 'dip'].includes(cmd)) return;
  switch (cmd) {
    case 'follow': { const t = UI.selEnemy; if (t) { setFollow(true); DIR.tgt = { kind: 'army', ref: t }; DIR.hold = 1e9; } break; }
    case 'view': UI.viewF = +arg; updateHUD(); break;
    case 'close': clearSel(); break;
    case 'over': clearSel(true); UI.selOver = arg; updateHUD(); break;
    case 'chf': UI.chronF = arg; break;
    case 'watch': { const a = GS.armies.find((x) => x.id === +arg && !x.dead); if (a) { clearSel(true); UI.selEnemy = a; focusOn(a); } break; }
    case 'selcity': { const s = MAP.cities[+arg]; if (s) { clearSel(true); UI.selCity = s; if (UI.selProv !== s.prov) { UI.selProv = s.prov; updateTerrainColors(); } focusOn(s); } break; }
    case 'dip': if (GS.auto) UI.selOver = 'wars'; else { clearSel(true); UI.selDip = +arg; UI.dipMsg = ''; } break;
    case 'recruit': if (c && recruit(F, c, arg)) Sfx.click(); else { Sfx.deny(); flashHint(c && c.queue.length >= 5 ? 'Recruitment queue is full.' : 'Not enough resources.'); } break;
    case 'walls': if (c && fortify(F, c)) Sfx.thunk(); else { Sfx.deny(); flashHint('Not enough resources.'); } break;
    case 'peace': { if (suePeace(+arg)) Sfx.horn(); else Sfx.deny(); updateHUD(); break; }
    case 'treaty': { if (renewTreaty(+arg)) Sfx.click(); else Sfx.deny(); break; }
    case 'war': { declareWar(PLAYER, +arg); UI.dipMsg = ''; break; }
    case 'imp': if (c && buildImp(F, c, arg)) Sfx.thunk(); else { Sfx.deny(); flashHint('Not enough resources.'); } break;
    case 'retreat': { let n = 0; for (const a of UI.sel) if (!a.dead && retreatArmy(a)) n++; if (n) Sfx.click(); else { Sfx.deny(); flashHint('Too early to disengage, or the walls hold you.'); } break; }
    case 'buy': case 'sell': if (trade(F, arg, cmd)) Sfx.click(); else { Sfx.deny(); flashHint(cmd === 'buy' ? 'Not enough gold.' : `Not enough ${arg} to sell.`); } updateHUD(); break;
    case 'fort': startPlacing(); break;
    case 'stance': for (const a of UI.sel) if (!a.dead && a.state !== 'battle') a.stance = arg; Sfx.thunk(); break;
    case 'split': { const a = UI.sel[0]; const b = a && splitArmy(a); if (b) { UI.sel.push(b); Sfx.click(); } else Sfx.deny(); break; }
    case 'mergeall': {
      const arms = myOrderables();
      if (arms.length < 2) break;
      const into = arms.reduce((m, a) => (menOf(a.comp) > menOf(m.comp) ? a : m), arms[0]);
      for (const a of arms) if (a !== into) { if (dist(a, into) < 2.5) mergeArmies(into, a); else orderTarget(a, 'merge', into); }
      Sfx.click(); break;
    }
    case 'stop': for (const a of myOrderables()) { a.path = null; a.target = null; a.state = 'idle'; } Sfx.click(); break;
    case 'selarmy': { const a = GS.armies.find((x) => x.id === +arg); if (a) { clearSel(true); UI.sel = [a]; focusOn(a); } break; }
    case 'attack': { const tgt = UI.selCity || UI.selEnemy || UI.selFort; if (tgt) issueOrder({ kind: UI.selCity ? 'city' : UI.selEnemy ? 'army' : 'fort', ref: tgt }); break; }
    case 'focus': { const t = UI.selCity || UI.selFort || UI.selBattle || UI.sel[0] || UI.selEnemy; if (t) focusOn(t); break; }
  }
  renderPanel(true);
}
export function headerHtml(color, title, sub) {
  return `<div class="ph" style="--fc:${color}"><button class="grip" data-sheet aria-label="Show more or less"></button><h2>${title}</h2><div class="sub">${sub}</div><button class="x" data-act="close" aria-label="Close">✕</button></div>`;
}
export function yieldChips(y) { return RES.filter((r) => y[r] > 0.05).map((r) => `<span class="chip">${IC[r]}<b>+${y[r].toFixed(1)}</b>/s</span>`).join(''); }
export function wallsDots(n) { return '▮'.repeat(n) + '<span style="opacity:.3">' + '▮'.repeat(3 - n) + '</span>'; }

export function dipPanel(g) {
  const G = GS.factions[g], P = GS.factions[PLAYER], R = relOf(PLAYER, g);
  const men = (f) => GS.armies.reduce((m, a) => m + (!a.dead && a.owner === f ? menOf(a.comp) : 0), 0);
  const war = atWar(PLAYER, g), lockL = R.lock - GS.time;
  const status = !G.alive ? 'Wiped out' : war ? `At war with ${pName()} for ${clockStr(GS.time - R.since)}` : lockL > 0 ? (R.lock === PEACE_TIME ? 'Opening truce' : 'Peace treaty') : 'At peace, no treaty';
  let h = headerHtml(G.css, G.name, status) + '<div class="pb">';
  h += `<div class="kv"><span class="chip">${IC.men}men <b>${fmtInt(men(g))}</b> vs ${fmtInt(men(PLAYER))}</span><span class="chip">points <b>${G.pts}</b> vs ${P.pts}</span></div>`;
  const others = GS.factions.filter((X) => X.alive && X.id !== g && X.id !== PLAYER && atWar(g, X.id)).map((X) => X.name);
  h += `<div class="note">${others.length ? `Also at war with <b>${others.join('</b> and <b>')}</b>.` : 'At peace with the other powers.'}</div>`;
  if (!G.alive) return h + '</div>';
  if (war) {
    h += `<div class="kv"><span class="chip">they are <b>${wearyWord(R.w[g] || 0)}</b></span><span class="chip">${pName()} is <b>${wearyWord(R.w[PLAYER] || 0)}</b></span><span class="chip">war score <b>${Math.round(R.sc[PLAYER] || 0)}</b> : ${Math.round(R.sc[g] || 0)}</span></div>`;
    const a = peaceAnswer(g);
    const lbl = a.ok ? (a.gold ? `🕊 Pay ${a.gold} gold for peace` : '🕊 Make peace') : '🕊 Offer peace';
    h += `<button class="abtn${a.ok && a.gold <= P.res.gold ? ' primary' : ' off'}" data-act="peace:${g}" style="justify-content:center">${lbl}</button>`;
    if (!a.ok) h += `<div class="note">${a.why}</div>`;
  } else {
    if (lockL > 0) h += `<div class="note">The ${R.lock === PEACE_TIME ? 'truce' : 'treaty'} binds for <b>${clockStr(lockL)}</b>. Declaring war before then makes ${pName()} an oath-breaker: no power will deal with you for ${mins(OATH_TIME)} minutes.</div>`;
    const t = treatyAnswer(g);
    h += `<div class="row2"><button class="abtn${t.ok ? '' : ' off'}" data-act="treaty:${g}" style="justify-content:center">🤝 Renew treaty +${mins(PACT_TIME)} min</button><button class="abtn danger" data-act="war:${g}" style="justify-content:center">⚔ Declare war</button></div>`;
    if (!t.ok) h += `<div class="note">${t.why}</div>`;
  }
  if (UI.dipMsg) h += `<div class="note">${UI.dipMsg}</div>`;
  h += `<div class="note">Wars wear powers down: losses, lost cities, hunger, other fronts and time make them readier for peace. A power that is losing pays tribute for peace; one that is winning demands it.</div>`;
  return h + '</div>';
}
export function onImpDone(c, id) { if (c.owner === ME && !GS.auto) { log(`<b>${IMPS[id].name}</b> finished in ${c.name}.`, 'good', c); Sfx.thunk(); } if (UI.selCity === c) renderPanel(true); }
export function impHtml(c, F) {
  let h = `<div class="sect">Improvements · ${c.imps.length + (c.impBuild ? 1 : 0)}/${impSlots(c)} slots</div>`;
  if (c.imps.length) h += '<div class="kv">' + c.imps.map((id) => `<span class="chip" title="${IMPS[id].desc}">${IMPS[id].ico} <b>${IMPS[id].name}</b></span>`).join('') + '</div>';
  if (c.impBuild) h += `<div class="note">Building ${IMPS[c.impBuild.id].ico} ${IMPS[c.impBuild.id].name}…</div><div class="prog"><i style="width:${Math.round(c.impBuild.t * 100)}%"></i></div>`;
  else if (c.imps.length < impSlots(c)) {
    for (const id of IMP_IDS) {
      if (hasImp(c, id)) continue;
      const cost = impCost(ME, id);
      h += `<button class="abtn${canAfford(F, cost) ? '' : ' off'}" data-act="imp:${id}" title="${IMPS[id].desc}"><span>${IMPS[id].ico} ${IMPS[id].name} <small style="opacity:.7">${IMPS[id].desc}</small></span><small>${costHtml(F, cost)}</small></button>`;
    }
  } else h += '<div class="note">All slots are used.</div>';
  return h;
}
export function cityPanel(c) {
  const F = GS.factions[ME];
  const P = MAP.provinces[c.prov];
  const mine = c.owner === ME;
  const besieged = c.battle && !c.battle.done;
  let sub = `${c.major ? 'Major city' : 'Town'} of ${P.name} · ${ownerName(c.owner)}${c.capital ? ' · capital' : ''}`;
  let h = headerHtml(fcss(c.owner), (c.capital ? '★ ' : '') + c.name, sub) + '<div class="pb">';
  const known = seesCity(c);
  h += `<div class="kv"><span class="chip">${IC.men}militia <b>${known ? fmtInt(c.militia) : '?'}</b>/${known ? fmtInt(c.militiaMax) : '?'}</span><span class="chip">${IC.walls}walls <b style="letter-spacing:-1px">${wallsDots(c.walls)}</b></span>${besieged && known ? '<span class="chip" style="background:#8a2018">Under attack</span>' : ''}</div>`;
  const k = 0.8 * c.loyal, sc = (y) => Object.fromEntries(RES.map((r) => [r, y[r] * k]));
  if (c.loyal < 0.99) h += `<div class="note">Recently conquered: the people are restless, income at <b>${Math.round(c.loyal * 100)}%</b> (recovers over time).</div>`;
  if (c.owner >= 0) {
    const secure = provSecure(P), pct = Math.round(SET_W(c) / provW(P) * 100);
    const cy = sc(cityYield(c, c.owner)), ly = sc(landShare(c)), tot = Object.fromEntries(RES.map((r) => [r, cy[r] + ly[r]]));
    h += `<div class="sect" title="The city's own income, plus its share of the province's land">Income · the city and ${pct}% of ${P.name}'s land${secure ? ', secure +12%' : ''}</div><div class="kv">${yieldChips(tot)}</div>`;
    const pl = plunderer(c.prov, c.owner);
    if (pl) h += `<div class="note">${ownerName(pl.owner)} troops are plundering ${P.name}: land income <b>−${Math.round((1 - PLUNDER) * 100)}%</b>. Drive them off, or guard the countryside with a fort.</div>`;
    const st = GS.factions[c.owner].stretch;
    if (st < 0.995) h += `<div class="note">${FACTIONS[c.owner].name} is overstretched: all income at <b>${Math.round(st * 100)}%</b> and conquests settle slowly.</div>`;
  }
  if (mine) {
    h += `<div class="sect">Recruit${besieged ? ' (blocked during the assault)' : ''}</div><div class="rgrid">`;
    for (const t of TYPES5) {
      const u = U(t, c.owner), cost = unitCost(t, c.owner), ok = canAfford(F, cost) && !besieged && c.queue.length < 5;
      h += `<button class="rbtn${ok ? '' : ' off'}${t === 'leg' ? ' elite' : ''}" data-act="recruit:${t}" title="${u.name}: ${u.desc}">${icOf(t, c.owner)}<span>${t === 'siege' ? 'Siege' : u.name}</span><span class="c">${costMini(F, cost)}</span></button>`;
    }
    h += '</div>';
    if (c.queue.length) {
      h += '<div class="queue">' + c.queue.map((q, i) => `<div class="qi" title="${U(q.type, c.owner).name}"><i style="height:${i === 0 ? Math.round(q.t * 100) : 0}%"></i>${icOf(q.type, c.owner)}</div>`).join('') + '</div>';
    }
    if (c.wallBuild) h += `<div class="note">Raising walls to level ${c.wallBuild.level}…</div><div class="prog"><i style="width:${Math.round(c.wallBuild.t * 100)}%"></i></div>`;
    if (!c.wallBuild && c.walls < 3) {
      const cost = wallCost(ME, c.walls + 1);
      h += `<button class="abtn${canAfford(F, cost) ? '' : ' off'}" data-act="walls"><span>${IC.walls.replace('<svg', '<svg width="18" height="18"')} Raise walls to level ${c.walls + 1}</span><small>${costHtml(F, cost)}</small></button>`;
    } else if (!c.wallBuild) h += '<div class="note">Walls are at their maximum.</div>';
    h += impHtml(c, F);
    h += `<button class="abtn${canAfford(F, fortCost(ME)) ? '' : ' off'}" data-act="fort"><span>${IC.fort.replace('<svg', '<svg width="18" height="18"')} Build a border fort</span><small>${costHtml(F, fortCost(ME))}</small></button>`;
    if (c.major) {
      h += `<div class="sect">Market · 100 at a time</div><div class="mkt">`;
      for (const r of ['food', 'wood', 'stone']) h += `<div class="mr">${IC[r]}<button class="mb${F.res.gold < marketOf(ME).buy ? ' off' : ''}" data-act="buy:${r}">Buy <small>−${marketOf(ME).buy} gold</small></button><button class="mb${F.res[r] < MARKET.lot ? ' off' : ''}" data-act="sell:${r}">Sell <small>+${marketOf(ME).sell} gold</small></button></div>`;
      h += '</div>';
    }
    const here = GS.armies.filter((a) => !a.dead && a.owner === ME && dist(a, c) < 3);
    if (here.length) h += '<div class="sect">Armies here</div>' + here.map((a) => `<button class="abtn" data-act="selarmy:${a.id}"><span>${IC.leg.replace('<svg', '<svg width="16" height="16"')} Army · ${fmtInt(menOf(a.comp))} men</span><small>select</small></button>`).join('');
  } else if (GS.auto) {
    if (c.owner >= 0) {
      h += `<div class="sect">${FACTIONS[c.owner].name} is building</div>`;
      if (c.queue.length) h += '<div class="queue">' + c.queue.map((q, i) => `<div class="qi" title="${U(q.type, c.owner).name}"><i style="height:${i === 0 ? Math.round(q.t * 100) : 0}%"></i>${icOf(q.type, c.owner)}</div>`).join('') + '</div>';
      if (c.wallBuild) h += `<div class="note">Raising walls to level ${c.wallBuild.level}…</div><div class="prog"><i style="width:${Math.round(c.wallBuild.t * 100)}%"></i></div>`;
      if (!c.queue.length && !c.wallBuild) h += '<div class="note">Nothing right now.</div>';
      const here = GS.armies.filter((a) => !a.dead && a.owner === c.owner && dist(a, c) < 3);
      if (here.length) h += `<div class="note">Garrison: <b>${fmtInt(here.reduce((m, a) => m + menOf(a.comp), 0))}</b> men camped by the walls.</div>`;
    }
    if (c.imps.length) h += '<div class="sect">Improvements</div><div class="kv">' + c.imps.map((id) => `<span class="chip" title="${IMPS[id].desc}">${IMPS[id].ico} ${IMPS[id].name}</span>`).join('') + '</div>';
    if (c.major) h += `<div class="note"><b>${c.name}</b> is the capital of ${P.name}: whoever holds it colours the province. The land's income is split between all its settlements.</div>`;
  } else {
    const arms = myOrderables();
    if (!known) h += `<div class="note">Out of sight: its militia and garrison are unknown. March closer, or send cavalry to scout.</div>`;
    else if (arms.length) {
      const o = estimateOdds(arms, { kind: 'city', ref: c }, 0, ME);
      h += oddsHtml(o, 'If your selected army attacks');
    } else h += `<div class="note">Select one of your armies, then ${isTouch ? 'tap' : 'right-click'} this city to see your odds and attack it.</div>`;
    if (c.imps.length) h += '<div class="sect">Improvements (the last one is looted if you take it)</div><div class="kv">' + c.imps.map((id) => `<span class="chip" title="${IMPS[id].desc}">${IMPS[id].ico} ${IMPS[id].name}</span>`).join('') + '</div>';
    h += `<div class="note">Taking <b>${c.name}</b> gives you ${Math.round(SET_W(c) / provW(P) * 100)}% of ${P.name}'s land income${c.major ? ' and the province colours' : ''}${c.major ? ', worth 3 victory points' : ', worth 1 victory point'}. Hold every settlement of a province for a +12% bonus.</div>`;
  }
  h += '</div>';
  return h;
}
export function compHtml(comp, f) {
  return '<div class="comp">' + TYPES5.map((t) => `<div class="cu${comp[t] < 1 ? ' zero' : ''}" title="${U(t, f).name}">${icOf(t, f)}<b>${t === 'siege' ? Math.floor(comp[t]) : fmt(comp[t])}</b><span>${t === 'siege' ? 'siege' : t === 'leg' ? sigOf(f).short : t === 'arch' ? 'archers' : t === 'cav' ? 'cavalry' : 'spears'}</span></div>`).join('') + '</div>';
}
export function armyStatus(a) {
  if (a.state === 'battle') return 'Fighting';
  if (a.state === 'rout') return 'Routing!';
  if (a.state === 'move') {
    const T = a.target;
    if (T && T.kind === 'army') return `Hunting ${T.ref.owner >= 0 ? 'a ' + FACTIONS[T.ref.owner].adj : 'an enemy'} army`;
    if (T && T.kind === 'city') return (T.ref.owner === a.owner ? 'Marching to ' : 'Marching on ') + T.ref.name;
    if (T && T.kind === 'fort') return 'Marching on a fort';
    if (T && T.kind === 'merge') return 'Joining another army';
    const left = a.path ? a.path.length - a.pi : 0;
    return `Marching · ~${Math.max(1, Math.round(left / BASE_SPEED))}s`;
  }
  const p = provAt(a.x, a.y);
  return p >= 0 ? `Camped in ${MAP.provinces[p].name}` : 'Camped';
}
export function myArmyPanel(list) {
  const comp = emptyComp(); for (const a of list) for (const t of TYPES5) comp[t] += a.comp[t];
  const men = menOf(comp);
  const a0 = list[0];
  const stars = list.length === 1 ? starsOf(a0) : 0;
  const title = list.length > 1 ? `${list.length} ${pAdj()} armies` : `${pAdj()} army`;
  const p = provAt(a0.x, a0.y), home = p >= 0 && MAP.provinces[p].owner === ME, forage = p >= 0 && atWar(ME, MAP.provinces[p].owner);
  let upk = 0; for (const a of list) { for (const t of ['spear', 'leg', 'arch', 'cav']) upk += a.comp[t] / 100 * U(t, a.owner).upk * (perkOf(a.owner).feed || 1); upk += a.comp.siege * UNITS.siege.upk; }
  let h = headerHtml(fcss(ME), `${title} · ${fmtInt(men)}${stars ? ' <span style="color:var(--gold);font-size:15px">' + '★'.repeat(stars) + '</span>' : ''}`, list.length === 1 ? armyStatus(a0) : 'Several armies selected') + '<div class="pb">';
  h += compHtml(comp, ME);
  const pay = list.reduce((s, a) => s + armyPay(a), 0);
  h += `<div class="kv"><span class="chip">${IC.food}eats <b>${(upk * (home || forage ? 1 : 1.35)).toFixed(1)}</b>/s${home ? '' : forage ? ' (foraging)' : ' (abroad)'}</span><span class="chip">${IC.gold}pay <b>${pay.toFixed(1)}</b>/s</span>${list.length === 1 ? `<span class="chip">victories <b>${a0.wins}</b></span>` : ''}</div>`;
  if (list.length === 1) { const g = groundInfo(a0.x, a0.y); h += `<div class="kv"><span class="chip">${g.name} · <b>${g.pace}</b></span></div>`; }
  const allDef = list.every((a) => a.stance === 'def'), allAgg = list.every((a) => a.stance === 'aggr');
  const defName = sigOf(ME).testudo ? 'Testudo' : 'Shield wall';
  h += `<div class="sect">Stance</div><div class="seg"><button class="${allAgg ? 'on' : ''}" data-act="stance:aggr">⚔ Aggressive</button><button class="${allDef ? 'on' : ''}" data-act="stance:def">🛡 ${defName}</button></div>`;
  h += `<div class="note">${allDef ? (sigOf(ME).testudo ? 'Testudo: <b>+22% defense</b>, legionaries take far less from arrows, slower march.' : 'Shield wall: <b>+22% defense</b>, slower march.') : 'Aggressive: <b>+12% attack</b>, weaker defense.'}</div>`;
  const busy = list.some((a) => a.state === 'battle' || a.state === 'rout');
  h += '<div class="row2">';
  if (list.length === 1) h += `<button class="abtn${busy || men < 100 ? ' off' : ''}" data-act="split" style="justify-content:center">Split</button>`;
  else h += `<button class="abtn${busy ? ' off' : ''}" data-act="mergeall" style="justify-content:center">Merge</button>`;
  h += `<button class="abtn${busy ? ' off' : ''}" data-act="stop" style="justify-content:center">Halt</button><button class="abtn" data-act="focus" style="justify-content:center">Center</button></div>`;
  const fighting = list.filter((a) => a.state === 'battle' && a.battle);
  if (fighting.length) {
    const ok = fighting.filter(canRetreat);
    if (ok.length) h += `<button class="abtn danger" data-act="retreat" style="justify-content:center">↩ Retreat · lose ~${Math.round(ok.reduce((m, a) => Math.max(m, retreatLoss(a)), 0) * 100)}% to the pursuit</button>`;
    else h += `<div class="note">${fighting.some((a) => a.battle.round < 2) ? 'The lines have only just met: you cannot disengage yet.' : 'Defenders cannot leave their walls.'}</div>`;
  }
  h += `<div class="note">${isTouch ? 'Tap the map to march; tap a city or army to attack, merge or garrison.' : 'Right-click the map to march; right-click an enemy to attack, a friendly army to merge, your city to garrison.'}</div>`;
  h += '</div>';
  return h;
}
export function enemyArmyPanel(a) {
  let h = headerHtml(fcss(a.owner), `${FACTIONS[a.owner].adj} army · ${fmtInt(menOf(a.comp))}${starsOf(a) ? ' <span style="color:var(--gold);font-size:15px">' + '★'.repeat(starsOf(a)) + '</span>' : ''}`, `${armyStatus(a)} · ${a.stance === 'def' ? (sigOf(a.owner).testudo ? 'testudo stance' : 'defensive stance') : 'aggressive stance'}`) + '<div class="pb">';
  h += compHtml(a.comp, a.owner);
  if (GS.auto) {
    const T = a.target;
    if (T && (T.kind === 'army' || T.kind === 'city' || T.kind === 'fort') && T.ref.owner !== a.owner && !T.ref.dead) {
      if (!a._odds || a._odds.ref !== T.ref || performance.now() - a._odds.t > 1500) a._odds = { ref: T.ref, t: performance.now(), o: estimateOdds([a], { kind: T.kind, ref: T.ref }, 24) };
      h += oddsHtml(a._odds.o, `Its odds against ${T.kind === 'city' ? T.ref.name : T.kind === 'fort' ? 'the fort' : ownerName(T.ref.owner) + ' army'}`);
    }
    const following = DIR.on && DIR.tgt && DIR.tgt.ref === a;
    h += `<button class="abtn${following ? ' primary' : ''}" data-act="follow" style="justify-content:center">${following ? '🎥 Following this army' : '🎥 Follow with the camera'}</button>`;
    return h + '</div>';
  }
  const arms = myOrderables();
  if (arms.length) h += oddsHtml(estimateOdds(arms, { kind: 'army', ref: a }, 0, ME), 'If your selected army attacks');
  else h += `<div class="note">Select your army first to see the odds against this one.</div>`;
  return h + '</div>';
}
export function fortPanel(f) {
  let h = headerHtml(fcss(f.owner), `${f.owner === ME ? 'Our' : FACTIONS[f.owner].adj} fort`, f.built < 1 ? 'Under construction' : 'Slows enemy armies within 3 leagues and blocks the road') + '<div class="pb">';
  if (f.built < 1) h += `<div class="prog"><i style="width:${Math.round(f.built * 100)}%"></i></div>`;
  h += `<div class="kv"><span class="chip">${IC.men}garrison <b>${fmtInt(f.militia)}</b>/${FORT_MAX}</span><span class="chip">${IC.walls}walls <b>${wallsDots(FORT_WALLS)}</b></span></div>`;
  const arms = myOrderables();
  if (f.owner !== ME && arms.length) h += oddsHtml(estimateOdds(arms, { kind: 'fort', ref: f }, 0, ME), 'If your selected army attacks');
  return h + '</div>';
}
export function provPanel(P) {
  const n = P.cells.length, C = P.counts;
  const seg = [[BIOME.PLAINS, '#8cbc58', 'plains'], [BIOME.STEPPE, '#c4b971', 'steppe'], [BIOME.FOREST, '#3f7a35', 'forest'], [BIOME.DESERT, '#e6c47e', 'desert'], [BIOME.HILLS, '#a69b6a', 'hills'], [BIOME.MOUNTAIN, '#8a8174', 'mountains'], [BIOME.SNOW, '#f3f5f8', 'peaks'], [BIOME.BEACH, '#e3d199', 'coast']];
  let h = headerHtml(fcss(P.owner), P.name, `Province · held by ${ownerName(P.owner)}`) + '<div class="pb">';
  h += '<div class="terrbar">' + seg.map(([b, c]) => `<i style="background:${c};width:${(C[b] / n * 100).toFixed(1)}%"></i>`).join('') + '</div>';
  h += '<div class="kv">' + seg.filter(([b]) => C[b] / n > 0.04).map(([b, c, nm]) => `<span class="chip"><i style="width:9px;height:9px;border-radius:2px;background:${c}"></i>${nm} ${Math.round(C[b] / n * 100)}%</span>`).join('') + '</div>';
  h += `<div class="sect">Land yield, split between its settlements (+12% if one power holds them all)</div><div class="kv">${yieldChips(Object.fromEntries(RES.map((r) => [r, P.yield[r] * 0.8])))}</div>`;
  h += '<div class="sect">Settlements</div>' + [P.major, ...P.small].map((id) => { const c = MAP.cities[id]; return `<div class="kv"><span class="chip" style="border-left:4px solid ${fcss(c.owner)}">${c.major ? '★ ' : ''}${c.name} · ${ownerName(c.owner)} · ${Math.round(SET_W(c) / provW(P) * 100)}%</span></div>`; }).join('');
  return h + '</div>';
}
export function battlePanel(B) {
  const s0 = B.sides[0], s1 = B.sides[1];
  const m0 = sideMen(s0), m1 = sideMen(s1);
  let h = headerHtml('#c23b22', B.kind === 'city' ? `Battle for ${B.place.name}` : B.kind === 'fort' ? 'Assault on a fort' : 'Field battle', B.done ? (B.winner === 0 ? `${ownerName(s0.faction)} won` : B.winner === 1 ? `${ownerName(s1.faction)} held` : 'Stopped by a peace treaty') : `Round ${B.round}`) + '<div class="pb">';
  h += `<div class="kv"><span class="chip" style="border-left:4px solid ${fcss(s0.faction)}">${ownerName(s0.faction)} (attacking) <b>${fmtInt(m0)}</b>/${fmtInt(B.startMen[0])}</span><span class="chip" style="border-left:4px solid ${fcss(s1.faction)}">${ownerName(s1.faction)} <b>${fmtInt(m1)}</b>/${fmtInt(B.startMen[1])}</span></div>`;
  const total = Math.max(1, m0 + m1);
  h += `<div class="terrbar"><i style="background:${fcss(s0.faction)};width:${m0 / total * 100}%"></i><i style="background:${fcss(s1.faction)};width:${m1 / total * 100}%"></i></div>`;
  const mods = modsList(B);
  if (mods.length) h += '<div class="sect">What decides it</div><div class="kv">' + mods.map(([n, e]) => `<span class="chip">${n}: ${e}</span>`).join('') + '</div>';
  return h + '</div>';
}
export function renderPanel(force) {
  if (UI.hold && !force) return;
  let h = '';
  UI.sel = UI.sel.filter((a) => !a.dead);
  if (UI.selEnemy && (UI.selEnemy.dead || !seesArmy(UI.selEnemy))) UI.selEnemy = null;
  if (UI.selBattle && !UI.selBattle.done && !seesBattle(UI.selBattle)) UI.selBattle = null;
  if (UI.selFort && UI.selFort.dead) UI.selFort = null;
  if (UI.sel.length) h = myArmyPanel(UI.sel);
  else if (UI.selDip != null && !GS.auto) h = dipPanel(UI.selDip);
  else if (UI.selOver) h = overviewPanel(UI.selOver);
  else if (UI.selEnemy) h = enemyArmyPanel(UI.selEnemy);
  else if (UI.selCity) h = cityPanel(UI.selCity);
  else if (UI.selFort) h = fortPanel(UI.selFort);
  else if (UI.selBattle) h = battlePanel(UI.selBattle);
  else if (UI.selProv != null) h = provPanel(MAP.provinces[UI.selProv]);
  if (h !== UI.lastPanel) { $panel.innerHTML = h; UI.lastPanel = h; }
  $hint.classList.toggle('hidden', !!h || UI.mode !== 'play' || UI.placing);
}
// Start-up wiring, run once from main.js after every module has loaded.
export function initPanel() {

  /* =========================================================
     Panel
     ========================================================= */
  $panel.addEventListener('pointerdown', () => { UI.hold = true; });
  $panel.addEventListener('pointerup', releaseHold);
  $panel.addEventListener('pointercancel', releaseHold);
  $panel.addEventListener('pointerleave', releaseHold);
  $panel.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    doAct(b.dataset.act);
  });
  // phones: the panel is a bottom sheet. Tap its grip to show more or less, swipe it up to open it fully, down to shrink or close it.
  let gripY = null;
  $panel.addEventListener('pointerdown', (e) => { gripY = e.target.closest('[data-sheet]') ? e.clientY : null; });
  $panel.addEventListener('pointerup', (e) => {
    if (gripY == null || !phoneLayout()) return;
    const dy = e.clientY - gripY; gripY = null;
    const full = $panel.classList.contains('full');
    if (dy > 40 && !full) { clearSel(); renderPanel(true); }
    else $panel.classList.toggle('full', dy < -40 ? true : dy > 40 ? false : !full);
    Sfx.click();
  });
}
