import { pairKey } from '../game/diplomacy.js';
import { cityOf } from '../game/chronicle.js';
import { needAt, STAND } from '../game/standing.js';
import { GS, MAP } from '../game/state.js';
import { FACTIONS, PLAYER } from '../game/data.js';
import { clock, FCHART, fmt, fmtInt, GLYPH } from './format.js';
import { deadOf, eventInfo, eventRow } from './overview.js';

/* =========================================================
   The end-of-war report: how it ended, how it went (two charts over time),
   every power's numbers, each war, and the moments that decided it.
   Charts: one line per power in its chart colour (FCHART), a legend and direct labels,
   a crosshair with the values at any moment, and a table view of the same numbers.
   ========================================================= */
export const REP = { charts: {}, table: {}, all: false, data: null };
const N = () => GS.factions.length;
const provinces = (f) => MAP.provinces.filter((p) => p.owner === f).length;
const sw = (f) => `<i class="sw" style="background:${FACTIONS[f].css}"></i>`;

// every war, rebuilt from the chronicle: who declared it on whom, how long it lasted, how it ended, what it cost
export function warsFromChron() {
  const open = {}, list = [];
  for (const e of GS.chron) {
    if (e.k === 'war') {
      const w = { f: e.f, g: e.g, start: e.t, end: null, how: 'ongoing', broke: !!e.b, took: { [e.f]: 0, [e.g]: 0 }, dead: { [e.f]: 0, [e.g]: 0 }, battles: 0 };
      open[pairKey(e.f, e.g)] = w; list.push(w);
    } else if (e.k === 'peace') {
      const k = pairKey(e.f, e.g), w = open[k];
      if (w) { w.end = e.t; w.how = 'peace'; w.payer = e.p; w.gold = e.n; delete open[k]; }
    } else if (e.k === 'fall') {
      for (const k in open) { const w = open[k]; if (w.f === e.f || w.g === e.f) { w.end = e.t; w.how = 'fall'; w.fell = e.f; delete open[k]; } }
    } else if (e.k === 'bat' && e.a >= 0 && e.d >= 0) {
      const w = open[pairKey(e.a, e.d)];
      if (w) { w.battles++; w.dead[e.a] += e.l[0]; w.dead[e.d] += e.l[1]; if (e.p === 'c' && e.w === 0) w.took[e.a]++; }
    }
  }
  return list;
}
export function reportData() {
  const T = Math.max(GS.time, 1), n = N();
  const winner = GS.over === 'auto' ? GS.winner : GS.over === 'win' ? PLAYER : GS.rivalF >= 0 ? GS.rivalF : -1;
  const series = (off) => GS.factions.map((F, i) => {
    const xs = [], ys = [];
    for (const r of GS.hist) { if (!F.alive && r[0] >= F.eliminatedAt) break; xs.push(r[0]); ys.push(r[off + i]); }
    if (!F.alive) { xs.push(Math.round(F.eliminatedAt)); ys.push(0); }   // wiped out: no city, no army left
    return { f: i, name: F.name, color: FCHART[i], xs, ys, fell: !F.alive, fellAt: F.eliminatedAt };
  });
  const rank = GS.factions.slice().sort((a, b) => (b.id === winner) - (a.id === winner) || (b.alive - a.alive) || (a.alive ? b.pts - a.pts : b.eliminatedAt - a.eliminatedAt));
  return { T, winner, rank, pts: series(1), men: series(1 + n), wars: warsFromChron() };
}

/* ---------- sections ---------- */
export function finalHtml(R) {
  return '<ol class="rep-final">' + R.rank.map((F, i) => {
    const fate = F.id === R.winner ? 'Wins the war' : !F.alive ? `Wiped out at ${clock(F.eliminatedAt)}` : `${i + 1}${['st', 'nd', 'rd', 'th'][Math.min(i, 3)]} place`;
    const you = !GS.auto && F.id === PLAYER;
    return `<li class="${F.id === R.winner ? 'win' : ''}${F.alive ? '' : ' dead'}" style="--fc:${F.css}"><i></i><div><b>${F.name}${you ? ' <small>(you)</small>' : ''}</b><span>${fate}</span></div><em><b>${F.pts}</b> points<br>${provinces(F.id)} provinces</em></li>`;
  }).join('') + '</ol>';
}
const niceStep = (max, n) => { const raw = max / n, p = 10 ** Math.floor(Math.log10(raw)), k = raw / p; return (k <= 1 ? 1 : k <= 2 ? 2 : k <= 5 ? 5 : 10) * p; };
const ticks = (max, n) => { const st = niceStep(max, n), out = [0]; while (out[out.length - 1] < max - 1e-6) out.push(out[out.length - 1] + st); return { list: out, top: out[out.length - 1] }; };
export function lineChart(id, W, H, S, opt) {
  const m = { l: 38, r: W < 480 ? 78 : 96, t: 14, b: opt.marks ? 40 : 26 };
  const pw = Math.max(60, W - m.l - m.r), ph = H - m.t - m.b, T = opt.T;
  const yt = ticks(opt.max, H < 200 ? 3 : 4), yMax = yt.top;
  const X = (t) => m.l + (t / T) * pw, Y = (v) => m.t + ph - (v / yMax) * ph;
  let s = `<svg class="ch" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${opt.label}">`;
  for (const v of yt.list) s += `<line class="gr" x1="${m.l}" x2="${m.l + pw}" y1="${Y(v)}" y2="${Y(v)}"/><text class="yl" x="${m.l - 7}" y="${Y(v) + 4}">${opt.fmtY(v)}</text>`;
  const xs = T > 1800 ? 600 : T > 900 ? 300 : T > 360 ? 120 : 60;
  for (let t = 0; t <= T + 1; t += xs) s += `<text class="xl" x="${X(t)}" y="${m.t + ph + 16}">${clock(t)}</text>`;
  s += `<line class="ax" x1="${m.l}" x2="${m.l + pw}" y1="${Y(0)}" y2="${Y(0)}"/>`;
  if (opt.ref) {
    const pts = []; for (let t = 0; t <= T; t += Math.max(5, T / 120)) pts.push(`${X(t).toFixed(1)},${Y(opt.ref(t)).toFixed(1)}`);
    pts.push(`${X(T).toFixed(1)},${Y(opt.ref(T)).toFixed(1)}`);
    s += `<polyline class="ref" points="${pts.join(' ')}"/>`;
  }
  if (opt.marks) for (const e of opt.marks) {
    const x = X(e.t), y = m.t + ph + 27;
    s += e.k === 'war' ? `<path class="mk war" d="M${x - 4} ${y + 3}h8l-4-7z"><title>${clock(e.t)}: ${strip(eventInfo(e).html)}</title></path>`
      : e.k === 'peace' ? `<circle class="mk peace" cx="${x}" cy="${y}" r="3.6"><title>${clock(e.t)}: ${strip(eventInfo(e).html)}</title></circle>`
        : `<path class="mk fall" d="M${x - 3.5} ${y - 3.5}l7 7M${x + 3.5} ${y - 3.5}l-7 7"><title>${clock(e.t)}: ${strip(eventInfo(e).html)}</title></path>`;
  }
  for (const L of S) if (L.xs.length > 1) s += `<polyline class="ln" stroke="${L.color}" points="${L.xs.map((t, i) => `${X(t).toFixed(1)},${Y(L.ys[i]).toFixed(1)}`).join(' ')}"/>`;
  // direct labels in the right margin, level with each line's last value (and the victory mark), nudged apart so none overlap
  const lx = m.l + pw + 6, labels = [];
  for (const L of S) if (L.xs.length) { const v = L.ys[L.ys.length - 1]; labels.push({ L, v, x: X(L.xs[L.xs.length - 1]), y: Y(v) }); }
  if (opt.ref) labels.push({ ref: true, v: opt.ref(T), y: Y(opt.ref(T)) });
  labels.sort((a, b) => a.y - b.y);
  labels.forEach((e, i) => { e.ly = i ? Math.max(e.y, labels[i - 1].ly + 15) : Math.max(e.y, m.t + 4); });
  const spill = labels.length ? labels[labels.length - 1].ly - (m.t + ph + 4) : 0;
  if (spill > 0) for (const e of labels) e.ly -= spill;
  for (const e of labels) {
    if (e.ref) { s += `<text class="refl" x="${lx}" y="${e.ly + 4}">Victory <tspan>${e.v}</tspan></text>`; continue; }
    s += `<circle class="end" cx="${e.x}" cy="${e.y}" r="4" fill="${e.L.color}"/>`;
    if (e.L.fell) s += `<path class="fellx" d="M${e.x - 4} ${e.y - 12}l7 7M${e.x + 3} ${e.y - 12}l-7 7"/>`;
    s += `<line class="lk" stroke="${e.L.color}" x1="${lx}" x2="${lx + 10}" y1="${e.ly}" y2="${e.ly}"/><text class="dl" x="${lx + 14}" y="${e.ly + 4}">${e.L.name} <tspan>${e.L.fell ? `fell ${clock(e.L.fellAt)}` : opt.fmtY(e.v)}</tspan></text>`;
  }
  s += `<g class="xh" visibility="hidden"><line x1="0" x2="0" y1="${m.t}" y2="${m.t + ph}"/>${S.map((L) => `<circle r="4.5" fill="${L.color}"/>`).join('')}</g>`;
  s += `<rect class="hit" x="${m.l}" y="${m.t}" width="${pw}" height="${ph + (opt.marks ? 30 : 0)}"/></svg>`;
  REP.charts[id] = { m, pw, ph, T, yMax, S, X, Y, fmtY: opt.fmtY, marks: !!opt.marks };
  return s;
}
const strip = (h) => h.replace(/<[^>]+>/g, '');
const legend = (S) => '<div class="lg">' + S.map((L) => `<span><i style="background:${L.color}"></i>${L.name}</span>`).join('') + '</div>';
export function chartTable(S, T, fmtY) {
  const step = T > 1800 ? 120 : 60, rows = [];
  for (let t = 0; t <= T + step - 1; t += step) {
    const tt = Math.min(t, T);
    rows.push(`<tr><th scope="row">${clock(tt)}</th>${S.map((L) => { let k = -1; for (let i = 0; i < L.xs.length; i++) if (L.xs[i] <= tt + 0.5) k = i; return `<td>${k < 0 || (L.fell && tt > L.xs[L.xs.length - 1] + 1) ? '–' : fmtY(L.ys[k])}</td>`; }).join('')}</tr>`);
    if (tt >= T) break;
  }
  return `<div class="tblwrap"><table class="ledger"><thead><tr><th scope="col">Time</th>${S.map((L) => `<th scope="col">${L.name}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}
export function chartBlock(id, title, sub, W, H, S, opt) {
  const tbl = REP.table[id];
  return `<section class="rep-chart" data-chart="${id}"><div class="rep-h"><h3>${title}</h3><button class="ghost-btn tbtn" data-tbl="${id}">${tbl ? 'Show the chart' : 'Show as a table'}</button></div><p class="rep-sub">${sub}</p>`
    + (tbl ? chartTable(S, opt.T, opt.fmtY) : `${legend(S)}<div class="chwrap">${lineChart(id, W, H, S, opt)}<div class="ctip hidden"></div></div>${opt.marks ? '<p class="rep-key"><span class="k war"></span>war declared <span class="k peace"></span>peace made <span class="k fall"></span>a power wiped out</p>' : ''}`)
    + '</section>';
}
export function ledgerHtml(R) {
  const S = GS.fstats, best = (vals) => Math.max(...vals);
  const rows = [
    ['Victory points', (f) => GS.factions[f].pts, 1], ['Provinces held', provinces, 1], ['Largest army', (f) => S[f].peak, 1], ['Men raised', (f) => S[f].raised, 0],
    ['Battles won', (f) => S[f].won, 1], ['Battles lost', (f) => S[f].lost, 0], ['Enemies killed', (f) => S[f].kills, 1], ['Men lost', (f) => S[f].dead, 0],
    ['Cities taken', (f) => S[f].captured, 1], ['Cities lost', (f) => S[f].lostC, 0], ['Revolts', (f) => S[f].revolts, 0],
    ['Wars declared', (f) => S[f].wars, 0], ['Peace treaties', (f) => S[f].peaces, 0], ['Tribute paid', (f) => S[f].tribP, 0], ['Tribute received', (f) => S[f].tribR, 0],
    ['Walls and buildings', (f) => S[f].works, 0],
  ];
  const ids = R.rank.map((F) => F.id);
  let h = '<section class="rep-ledger"><h3>The ledger</h3><p class="rep-sub">Every power\'s numbers, from the first day to the last. The best in each of the leading rows is marked.</p><div class="tblwrap"><table class="ledger"><thead><tr><th></th>'
    + ids.map((f) => `<th scope="col" class="${!GS.auto && f === PLAYER ? 'me' : ''}">${sw(f)}${FACTIONS[f].name}</th>`).join('') + '</tr></thead><tbody>';
  for (const [name, get, hi] of rows) {
    const vals = ids.map(get), top = best(vals);
    h += `<tr><th scope="row">${name}</th>${vals.map((v, i) => `<td class="${hi && v === top && v > 0 ? 'top' : ''}${!GS.auto && ids[i] === PLAYER ? ' me' : ''}">${fmtInt(v)}</td>`).join('')}</tr>`;
  }
  return h + '</tbody></table></div></section>';
}
export function warsHtml(R) {
  if (!R.wars.length) return '<section class="rep-wars"><h3>Wars</h3><p class="rep-sub">No power ever declared war: the continent was settled without a fight.</p></section>';
  const T = R.T, pct = (t) => ((t / T) * 100).toFixed(2) + '%';
  let h = `<section class="rep-wars"><h3>Wars</h3><p class="rep-sub">${R.wars.length} war${R.wars.length > 1 ? 's' : ''}, on the same timeline as the charts. Each bar shows who declared the war (top) on whom (bottom), and how long it lasted.</p><div class="gantt">`;
  for (const w of R.wars) {
    const end = w.end == null ? T : w.end, F = FACTIONS[w.f], G = FACTIONS[w.g];
    const how = w.how === 'peace' ? `Ended in peace${w.gold ? `, ${FACTIONS[w.payer].name} paying ${fmtInt(w.gold)} gold` : ''}.`
      : w.how === 'fall' ? `Ended when ${FACTIONS[w.fell].name} was wiped out.` : 'Still being fought when the war ended.';
    const took = [w.f, w.g].filter((f) => w.took[f]).map((f) => `${FACTIONS[f].name} took ${w.took[f]} cit${w.took[f] > 1 ? 'ies' : 'y'}`);
    const cost = w.battles ? `${w.battles} battle${w.battles > 1 ? 's' : ''}, ${fmtInt(w.dead[w.f])} ${F.adj} and ${fmtInt(w.dead[w.g])} ${G.adj} dead.` : 'No battle was fought.';
    h += `<div class="gw"><div class="gl">${sw(w.f)}<b>${F.name}</b> on ${sw(w.g)}<b>${G.name}</b><em>${clock(w.start)} to ${w.end == null ? 'the end' : clock(w.end)}</em></div>`
      + `<div class="gt"><i style="left:${pct(w.start)};width:max(3px, ${pct(end - w.start)})"><b style="background:${FCHART[w.f]}"></b><b style="background:${FCHART[w.g]}"></b></i>${w.how === 'peace' ? `<span class="ge peace" style="left:${pct(end)}">${GLYPH.dove}</span>` : w.how === 'fall' ? `<span class="ge fall" style="left:${pct(end)}">${GLYPH.skull}</span>` : ''}</div>`
      + `<p>${w.broke ? `${F.name} broke a treaty to start it. ` : ''}${how} ${took.length ? took.join(', ') + '. ' : ''}${cost}</p></div>`;
  }
  return h + `<div class="gw scale"><div></div><div class="gs"><span>0:00</span><span>${clock(T)}</span></div></div></div></section>`;
}
export function momentsHtml() {
  const C = GS.chron;
  const bloody = C.filter((e) => e.k === 'bat').sort((a, b) => deadOf(b) - deadOf(a)).slice(0, 5);
  const key = C.filter((e) => e.k === 'war' || e.k === 'peace' || e.k === 'fall' || bloody.includes(e)
    || ((e.k === 'rev' || (e.k === 'bat' && e.p === 'c' && e.w === 0)) && cityOf(e) && cityOf(e).major));
  const list = REP.all ? C : key;
  const rows = list.map((e) => { const I = eventInfo(e); if (bloody.includes(e)) I.sub = `${I.sub}: one of the bloodiest battles of the war`; return eventRow(e, I); }).join('');
  return `<section class="rep-moments"><div class="rep-h"><h3>${REP.all ? 'Every event' : 'Key moments'}</h3><button class="ghost-btn tbtn" data-allev>${REP.all ? 'Key moments only' : `Show every event (${C.length})`}</button></div>`
    + `<p class="rep-sub">${REP.all ? 'Everything the chronicle recorded, in order.' : 'Wars and treaties, the major cities that changed hands, the powers that fell and the five bloodiest battles.'} Click one to see the place on the map.</p>`
    + (rows ? `<div class="chron">${rows}</div>` : '<p class="rep-sub">Nothing was recorded.</p>') + '</section>';
}
export function renderReport() {
  const el = document.getElementById('report');
  const R = REP.data = reportData();
  const W = Math.max(280, Math.min(el.clientWidth || 640, 860)), phone = W < 520;
  const marks = GS.chron.filter((e) => e.k === 'war' || e.k === 'peace' || e.k === 'fall');
  let h = finalHtml(R);
  if (GS.hist.length > 1) {
    const maxPts = Math.max(needAt(0), ...R.pts.flatMap((L) => L.ys));
    h += chartBlock('pts', 'Victory points', `Every power's points through the war, against the ${STAND.need} needed to win (the mark eases after 25 minutes). Hover or touch the chart for the numbers at any moment.`, W, phone ? 220 : 260, R.pts, { T: R.T, max: maxPts, ref: needAt, fmtY: (v) => String(Math.round(v)), label: 'Victory points of each power over time', marks });
    const maxMen = Math.max(500, ...R.men.flatMap((L) => L.ys));
    h += chartBlock('men', 'Men under arms', 'The size of every army in the field, added up.', W, phone ? 160 : 190, R.men, { T: R.T, max: maxMen, fmtY: fmt, label: 'Men under arms of each power over time' });
  } else h += '<p class="rep-sub">This war was resumed from an older save, so there is no record of how it went before.</p>';
  h += ledgerHtml(R) + warsHtml(R) + momentsHtml();
  el.innerHTML = h;
}
// crosshair: the values of every power at the moment under the pointer
export function chartHover(id, svg, clientX) {
  const C = REP.charts[id]; if (!C) return;
  const r = svg.getBoundingClientRect(), sx = (clientX - r.left) * (svg.viewBox.baseVal.width / r.width);
  const t = Math.max(0, Math.min(C.T, ((sx - C.m.l) / C.pw) * C.T));
  const H = GS.hist; let k = 0;
  for (let i = 0; i < H.length; i++) if (Math.abs(H[i][0] - t) < Math.abs(H[k][0] - t)) k = i;
  const tk = H[k][0], g = svg.querySelector('.xh'), x = C.X(tk);
  g.setAttribute('visibility', 'visible');
  const ln = g.querySelector('line'); ln.setAttribute('x1', x); ln.setAttribute('x2', x);
  const vals = [];
  C.S.forEach((L, i) => {
    const c = g.querySelectorAll('circle')[i];
    let j = L.xs.indexOf(tk);
    if (j < 0 && L.fell && tk <= L.xs[L.xs.length - 1] + 10 && tk >= L.xs[L.xs.length - 1]) j = L.xs.length - 1;
    if (j < 0) { c.setAttribute('visibility', 'hidden'); return; }
    c.setAttribute('visibility', 'visible'); c.setAttribute('cx', x); c.setAttribute('cy', C.Y(L.ys[j]));
    vals.push([L, L.ys[j]]);
  });
  vals.sort((a, b) => b[1] - a[1]);
  const prev = k > 0 ? H[k - 1][0] : -1;
  const evs = C.marks ? GS.chron.filter((e) => (e.k === 'war' || e.k === 'peace' || e.k === 'fall') && e.t > prev && e.t <= tk + 0.5).slice(0, 3) : [];
  const tt = svg.parentNode.querySelector('.ctip');
  tt.innerHTML = `<b>${clock(tk)}</b>` + vals.map(([L, v]) => `<div><i style="background:${L.color}"></i>${L.name}<em>${C.fmtY(v)}</em></div>`).join('')
    + (id === 'pts' ? `<div class="need">Needed to win<em>${needAt(tk)}</em></div>` : '') + evs.map((e) => `<p>${eventInfo(e).html}</p>`).join('');
  tt.classList.remove('hidden');
  const px = (x / (svg.viewBox.baseVal.width)) * r.width, w = tt.offsetWidth;
  tt.style.left = (px + 14 + w > r.width ? px - 14 - w : px + 14) + 'px';
  tt.style.top = '6px';
}
export function chartLeave(svg) {
  const g = svg.querySelector('.xh'); if (g) g.setAttribute('visibility', 'hidden');
  const tt = svg.parentNode.querySelector('.ctip'); if (tt) tt.classList.add('hidden');
}
