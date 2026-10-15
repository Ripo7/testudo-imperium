// The tuner's report: report.html to read (self-contained, the game's colours), summary.md for a pull request.
import fs from 'node:fs';
import path from 'node:path';
import { PARAM } from '../../src/game/params.js';
import { FIGHTERS, fighterName, POWERS } from './battle.js';
import { TARGETS } from './targets.js';

export const POWER_CSS = ['#c6404a', '#a966b8', '#1e8fee', '#af8433'];   // FCHART (ui/format.js): checked on the dark tablet
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const pct = (v) => `${Math.round(v * 100)}%`;
const fmt = (v) => (Math.abs(v) >= 10 ? String(Math.round(v)) : String(+(+v).toFixed(3)));
const change = (a, b) => (a ? `${b > a ? '+' : '−'}${Math.round(Math.abs(b / a - 1) * 100)}%` : '');

// win shares, before and after, each with its 95% interval, against the target band
export function sharesSvg(before, after) {
  const W = 640, rowH = 46, top = 30, left = 96, right = 24, H = top + rowH * 4 + 34;
  const sx = (v) => left + (v / 0.5) * (W - left - right);   // 0..50%
  const [lo, hi] = TARGETS.wars.winShare.band;
  let s = `<svg viewBox="0 0 ${W} ${H}" class="ch" role="img" aria-label="Share of the wins of each power, before and after, with 95% intervals"><rect x="${sx(lo)}" y="${top - 8}" width="${sx(hi) - sx(lo)}" height="${rowH * 4 + 4}" class="band"/>`;
  for (let v = 0; v <= 0.5 + 1e-9; v += 0.1) s += `<line x1="${sx(v)}" x2="${sx(v)}" y1="${top - 8}" y2="${top + rowH * 4 - 4}" class="gr"/><text x="${sx(v)}" y="${top + rowH * 4 + 14}" class="xl">${Math.round(v * 100)}%</text>`;
  s += `<text x="${sx((lo + hi) / 2)}" y="${top - 13}" class="bl">target ${pct(lo)}–${pct(hi)}</text>`;
  POWERS.forEach((p, f) => {
    const y = top + f * rowH + 10;
    s += `<text x="${left - 12}" y="${y + 9}" class="yl" style="fill:${POWER_CSS[f]}">${p}</text>`;
    [[before, 'before', 0], [after, 'after', 14]].forEach(([S, cls, dy]) => {
      if (!S) return;
      const [a, b] = S.ci[f], v = S.share[f];
      s += `<line x1="${sx(a)}" x2="${sx(b)}" y1="${y + dy}" y2="${y + dy}" class="ci ${cls}"/><circle cx="${sx(v)}" cy="${y + dy}" r="5" class="dot ${cls}"><title>${p} ${cls}: ${pct(v)} of the wins (95%: ${pct(a)}–${pct(b)})</title></circle>`;
      s += `<text x="${Math.min(W - 4, sx(b) + 8)}" y="${y + dy + 4}" class="dl">${pct(v)}</text>`;
    });
  });
  return s + '</svg>';
}
const cell = (v) => { const a = Math.min(1, Math.abs(v) / 0.4); return `<td style="background:${v >= 0 ? `rgba(143,208,174,${(a * 0.55).toFixed(2)})` : `rgba(224,87,60,${(a * 0.6).toFixed(2)})`}">${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}</td>`; };
export function matchupTable(M) {
  const names = FIGHTERS.map(fighterName);
  return `<table class="mx"><thead><tr><th></th>${names.map((n) => `<th scope="col">${esc(n)}</th>`).join('')}</tr></thead><tbody>${M.map((row, i) => `<tr><th scope="row">${esc(names[i])}</th>${row.map((v, j) => (i === j ? '<td class="self">·</td>' : cell(v))).join('')}</tr>`).join('')}</tbody></table>`;
}
export function itemsTable(before, after) {
  const key = (x) => x.name, B = new Map(before.items.map((x) => [key(x), x]));
  const rows = after.items.map((x) => [B.get(key(x)), x]).filter(([b, a]) => (b && b.penalty > 1e-6) || a.penalty > 1e-6).sort((p, q) => (q[0] ? q[0].penalty : 0) + q[1].penalty - (p[0] ? p[0].penalty : 0) - p[1].penalty);
  if (!rows.length) return '<p>Every measure is within its target, before and after.</p>';
  return `<table class="ledger"><thead><tr><th scope="col">Measure</th><th scope="col">Target</th><th scope="col">Before</th><th scope="col">After</th><th scope="col">Penalty</th></tr></thead><tbody>${rows.map(([b, a]) => `<tr><th scope="row">${esc(a.name)}</th><td>${a.band.map(fmt).join('–')}</td><td class="${b && b.penalty > 1e-6 ? 'bad' : ''}">${b ? fmt(b.value) : ''}</td><td class="${a.penalty > 1e-6 ? 'bad' : 'ok'}">${fmt(a.value)}</td><td>${b ? b.penalty.toFixed(2) : ''} → ${a.penalty.toFixed(2)}</td></tr>`).join('')}</tbody></table>`;
}
export function changesTable(changes) {
  const ids = Object.keys(changes);
  if (!ids.length) return '<p>No value changed.</p>';
  return `<table class="ledger"><thead><tr><th scope="col">Parameter</th><th scope="col">Before</th><th scope="col">After</th><th scope="col">Change</th><th scope="col">Bounds</th></tr></thead><tbody>${ids.map((id) => { const P = PARAM.get(id), [a, b] = changes[id]; return `<tr><th scope="row">${esc(P.label)}<small>${esc(id)}</small></th><td>${fmt(a)}</td><td>${fmt(b)}</td><td>${change(a, b)}</td><td>${fmt(P.min)}–${fmt(P.max)}</td></tr>`; }).join('')}</tbody></table>`;
}
export function warsBlock(S) {
  if (!S) return '';
  return `<p>${S.n} wars · median ${S.median.toFixed(1)} min (10% under ${S.p10.toFixed(1)}, 10% over ${S.p90.toFixed(1)}) · at the time limit ${pct(S.unfinished)} · per war: ${S.forts.toFixed(1)} forts, ${S.retreats.toFixed(1)} retreats, ${S.revolts.toFixed(1)} revolts, ${S.peaces.toFixed(1)} peace treaties</p>
<div class="wrap"><table class="ledger wide"><thead><tr><th scope="col">Power</th><th scope="col">Spearmen</th><th scope="col">Elite</th><th scope="col">Archers</th><th scope="col">Cavalry</th><th scope="col">Engines / war</th><th scope="col">Improvements / war</th><th scope="col">Perk worth / min</th></tr></thead><tbody>${POWERS.map((p, f) => { const c = S.raised[f], m = c.spear + c.leg + c.arch + c.cav || 1; return `<tr><th scope="row" style="color:${POWER_CSS[f]}">${p}</th><td>${pct(c.spear / m)}</td><td>${pct(c.leg / m)}</td><td>${pct(c.arch / m)}</td><td>${pct(c.cav / m)}</td><td>${(c.siege / S.n).toFixed(1)}</td><td>${Object.entries(S.imps[f]).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(' · ')}</td><td>${S.perk[f]}</td></tr>`; }).join('')}</tbody></table></div>`;
}
export const CSS = `:root{color-scheme:dark;--bg:#1c120b;--panel:#21160e;--line:rgba(226,189,98,.28);--hair:rgba(226,189,98,.14);--text:#f1e6cd;--muted:#c9b791;--gold:#e2bd62;--bad:#e0573c;--good:#8fd0ae}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 "Alegreya Sans","Gill Sans","Segoe UI",system-ui,sans-serif}
main{max-width:960px;margin:0 auto;padding:32px 16px 64px}h1{font:400 34px/1.15 Marcellus,Georgia,serif;color:var(--gold);margin:0 0 6px}
h2{font:400 22px Marcellus,Georgia,serif;color:var(--gold);margin:36px 0 8px}.lede{font-size:17px;color:var(--text);max-width:66ch}p{max-width:72ch;color:var(--muted)}
table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums lining-nums}.wrap{overflow-x:auto}
.ledger th,.ledger td{padding:6px 10px;text-align:right;border-bottom:1px solid var(--hair);white-space:nowrap}.ledger thead th{color:var(--muted);font-weight:600;border-bottom:1px solid var(--line)}
.ledger th[scope=row],.ledger thead th:first-child{text-align:left;font-weight:600;white-space:normal}.ledger.wide td:nth-child(7){white-space:normal;text-align:left;min-width:200px}.ledger th small{display:block;color:var(--muted);font-weight:400;font-size:12px}
td.bad{color:var(--bad)}td.ok{color:var(--good)}
.mx{font-size:13px}.mx th,.mx td{padding:5px 6px;text-align:center;border:2px solid var(--bg)}.mx thead th{color:var(--muted);font-weight:600;font-size:12px}.mx th[scope=row]{text-align:left;white-space:nowrap}.mx td.self{color:var(--muted)}
.ch{width:100%;height:auto;display:block}.ch text{font-size:12px;fill:var(--muted)}.ch .yl{text-anchor:end;font-weight:700;font-size:13px}.ch .xl{text-anchor:middle}.ch .bl{text-anchor:middle;fill:var(--gold)}.ch .dl{fill:var(--text);font-weight:700}
.ch .band{fill:rgba(226,189,98,.12)}.ch .gr{stroke:rgba(226,189,98,.12)}.ch .ci{stroke-width:2;stroke-linecap:round}.ch .ci.before{stroke:#8a7d66}.ch .ci.after{stroke:var(--gold)}
.ch .dot.before{fill:var(--bg);stroke:#a8987c;stroke-width:2}.ch .dot.after{fill:var(--gold);stroke:var(--bg);stroke-width:2}
.lg{display:flex;gap:18px;font-size:13px;color:var(--muted);margin:4px 0 8px}.lg i{display:inline-block;width:11px;height:11px;border-radius:50%;margin-right:6px;vertical-align:-1px}
.lg .b{border:2px solid #a8987c}.lg .a{background:var(--gold)}.two{display:grid;grid-template-columns:1fr;gap:18px}
details{margin-top:28px;color:var(--muted)}pre{white-space:pre-wrap;font-size:12.5px;color:var(--muted)}
.verdict{display:inline-block;margin-top:10px;padding:4px 10px;border-radius:4px;background:rgba(226,189,98,.12);color:var(--gold);font-weight:700}`;

export function writeReport(dir, { before, after, changes, fast, fair, log, applied }) {
  const n = Object.keys(changes).length, date = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const verdict = after.total < before.total ? (applied ? 'Applied to balance.js' : 'Proposed: not applied yet') : 'No improvement found: nothing to apply';
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Balance tuning</title><style>${CSS}</style></head><body><main>
<h1>Balance tuning</h1>
<p class="lede">${date} · the scorecard's penalty went from <b>${before.total.toFixed(2)}</b> to <b>${after.total.toFixed(2)}</b> with ${n} value${n === 1 ? '' : 's'} changed, checked on ${after.wars ? after.wars.n : 0} wars the tuner never played.</p>
<span class="verdict">${verdict}</span>
<h2>What changed</h2><div class="wrap">${changesTable(changes)}</div>
<h2>Share of the wins</h2><div class="lg"><span><i class="b"></i>before</span><span><i class="a"></i>after</span><span>lines: 95% intervals</span></div>${before.wars ? sharesSvg(before.wars, after.wars) : ''}
<h2>Measures outside their targets</h2><div class="wrap">${itemsTable(before, after)}</div>
<h2>Units at equal worth</h2><p>Each row's edge over each column, fighting on open ground, from −1 (wiped out) to +1 (untouched).</p><div class="two"><div class="wrap"><h3>Before</h3>${matchupTable(before.battles.matchups)}</div><div class="wrap"><h3>After</h3>${matchupTable(after.battles.matchups)}</div></div>
<h2>The wars</h2><h3>Before</h3>${warsBlock(before.wars)}<h3>After</h3>${warsBlock(after.wars)}
${fair ? `<h2>Fairness rounds</h2><div class="wrap"><table class="ledger"><thead><tr><th scope="col">Round</th>${POWERS.map((p) => `<th scope="col">${p}</th>`).join('')}<th scope="col">Levers</th></tr></thead><tbody>${fair.hist.map((h, k) => `<tr><th scope="row">${k + 1}</th>${h.share.map((s) => `<td>${pct(s)}</td>`).join('')}<td>${h.levers.map(fmt).join(' · ')}</td></tr>`).join('')}</tbody></table></div>` : ''}
<details><summary>Run log</summary><pre>${esc(log.join('\n'))}</pre></details>
</main></body></html>`;
  fs.writeFileSync(path.join(dir, 'report.html'), html);
  const md = [`## Balance tuning: penalty ${before.total.toFixed(2)} → ${after.total.toFixed(2)}`, '', `${verdict}. ${n} value${n === 1 ? '' : 's'} changed; checked on ${after.wars ? after.wars.n : 0} wars the tuner never played (fog of war on).`, ''];
  if (n) { md.push('| Parameter | Before | After |', '|---|---:|---:|'); for (const id in changes) md.push(`| ${PARAM.get(id).label} (\`${id}\`) | ${fmt(changes[id][0])} | ${fmt(changes[id][1])} |`); md.push(''); }
  if (before.wars && after.wars) {
    md.push('| Power | Wins before | Wins after |', '|---|---:|---:|');
    POWERS.forEach((p, f) => md.push(`| ${p} | ${pct(before.wars.share[f])} (${pct(before.wars.ci[f][0])}–${pct(before.wars.ci[f][1])}) | ${pct(after.wars.share[f])} (${pct(after.wars.ci[f][0])}–${pct(after.wars.ci[f][1])}) |`));
    md.push('', `Median war ${before.wars.median.toFixed(1)} → ${after.wars.median.toFixed(1)} min; at the time limit ${pct(before.wars.unfinished)} → ${pct(after.wars.unfinished)}.`, '');
  }
  const left = after.items.filter((x) => x.penalty > 1e-6).sort((a, b) => b.penalty - a.penalty).slice(0, 8);
  if (left.length) md.push('Still outside their targets:', ...left.map((x) => `- ${x.name}: ${fmt(x.value)} (target ${x.band.map(fmt).join('–')})`), '');
  fs.writeFileSync(path.join(dir, 'summary.md'), md.join('\n'));
}
