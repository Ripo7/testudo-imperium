// The balance parameters from the command line (src/game/params.js, values in src/game/balance.js).
//   node tools/params.js [list] [group or text]     every parameter: value, bounds, meaning
//   node tools/params.js set id=value [id=value…]   change values and write balance.js
//   node tools/params.js diff [git ref]             what differs from balance.js at a git ref (default HEAD)
//   node tools/params.js check                      every value within its bounds?
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { applyParams, balanceSource, GROUPS, PARAM, PARAMS, paramsHash, paramValues } from '../src/game/params.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const BALANCE_FILE = path.join(ROOT, 'src/game/balance.js');
export const fmtV = (v) => (Number.isInteger(v) ? String(v) : String(+v.toPrecision(4)));
// write balance.js from the current values
export function writeBalance() { fs.writeFileSync(BALANCE_FILE, balanceSource()); }
// the values of balance.js at a git ref ({ id: value }), read without touching the working copy
export async function valuesAt(ref) {
  let src;
  try { src = execFileSync('git', ['show', `${ref}:src/game/balance.js`], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
  catch (e) { throw new Error(`no src/game/balance.js at ${ref}`); }
  const body = src.slice(src.indexOf('{'), src.lastIndexOf('}') + 1);
  const B = JSON.parse(body), out = {};
  for (const P of PARAMS) { let o = B; for (const k of P.id.split('.')) o = o == null ? undefined : o[k]; if (typeof o === 'number') out[P.id] = o; }
  return out;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const [cmd = 'list', ...args] = process.argv.slice(2);
  const cur = paramValues();
  if (cmd === 'list') {
    const q = args.join(' ').toLowerCase();
    for (const g of GROUPS) {
      const L = PARAMS.filter((P) => P.group === g && (!q || g === q || P.id.toLowerCase().includes(q) || P.label.toLowerCase().includes(q)));
      if (!L.length) continue;
      console.log(`\n${g} (${L.filter((P) => !P.fixed).length} tunable)`);
      for (const P of L) console.log(`  ${P.id.padEnd(34)} ${fmtV(cur[P.id]).padStart(7)}  ${P.fixed ? '  fixed       ' : `[${fmtV(P.min)}–${fmtV(P.max)}]`.padEnd(14)} ${P.label}`);
    }
    console.log(`\n${PARAMS.length} parameters, set ${paramsHash()}`);
  } else if (cmd === 'set') {
    const vals = {};
    for (const a of args) {
      const [id, v] = a.split('=');
      const P = PARAM.get(id);
      if (!P) { console.error(`unknown parameter ${id}`); process.exit(1); }
      if (+v < P.min || +v > P.max) console.warn(`${id}: ${v} is outside its bounds [${fmtV(P.min)}–${fmtV(P.max)}]`);
      vals[id] = +v;
    }
    applyParams(vals);
    writeBalance();
    for (const id in vals) console.log(`${id}: ${fmtV(cur[id])} -> ${fmtV(paramValues()[id])}`);
    console.log(`balance.js written, set ${paramsHash()}`);
  } else if (cmd === 'diff') {
    const ref = args[0] || 'HEAD';
    let base;
    try { base = await valuesAt(ref); } catch (e) { console.error(e.message); process.exit(1); }
    let n = 0;
    for (const P of PARAMS) if (base[P.id] !== cur[P.id]) { n++; console.log(`  ${P.id.padEnd(34)} ${fmtV(base[P.id] ?? NaN).padStart(7)} -> ${fmtV(cur[P.id]).padEnd(7)} ${P.label}`); }
    console.log(n ? `${n} parameter(s) differ from ${ref}` : `same values as ${ref}`);
  } else if (cmd === 'check') {
    const bad = PARAMS.filter((P) => cur[P.id] < P.min || cur[P.id] > P.max);
    for (const P of bad) console.log(`  ${P.id}: ${cur[P.id]} outside [${P.min}–${P.max}]`);
    console.log(bad.length ? `${bad.length} value(s) out of bounds` : `all ${PARAMS.length} values within bounds`);
    process.exit(bad.length ? 1 : 0);
  } else { console.error(`unknown command ${cmd}: list, set, diff or check`); process.exit(1); }
}
