import { BALANCE } from './balance.js';

/* =========================================================
   The parameters: every number in balance.js, with what it means, the bounds a tuner may move it within
   and its group (units, elite, combat, buildings, perks, economy, ai, diplomacy).
   A parameter's id is its path in BALANCE ('units.spear.atk', 'buildings.walls.cost.1.stone').
   Read and change them with getParam / setParam / applyParams; paramsHash stamps a set of values, and
   balanceSource writes balance.js back from the current values (tools/params.js, tools/tune.js).
   A number with no rule here stops the game at start-up: give every new number in balance.js a rule.
   ========================================================= */
export const NAMES = { spear: 'Spearmen', arch: 'Archers', cav: 'Cavalry', siege: 'Siege engines', leg: 'Legionaries', ele: 'War elephants', gae: 'Gaesatae', char: 'Chariots', shot: 'arrows and chariot volleys' };
export const POWERS = ['Rome', 'Carthage', 'Gaul', 'Egypt'];
// in the combat tables 'leg' is every power's elite unit
export const ROLE = Object.assign({}, NAMES, { leg: 'elite units' });
export const BIOME_OF = { 5: 'forest', 7: 'hills', 8: 'mountains', 9: 'peaks' };
// bounds: around the default (rel) or fixed ones (abs)
export const rel = (lo, hi) => (v) => [v * lo, v * hi];
export const abs = (lo, hi) => () => [lo, hi];
const R = (re, group, label, bounds, int) => ({ re, group, label, bounds, int: !!int });
// named numbers: id -> [label, bounds, int]
export const NAMED = {
  'combat.kDmg': ['Damage per round (the pace of every battle)', abs(0.05, 0.11)],
  'combat.roundT': ['Seconds per battle round', abs(0.35, 0.9)],
  'combat.archR': ['Archers: strength in the opening volleys', rel(0.6, 1.6)],
  'combat.archM': ['Archers: strength in the melee', rel(0.6, 1.6)],
  'combat.rr': ['Rounds of volleys before the lines meet', abs(1, 5), true],
  'combat.aggrAtk': ['Aggressive stance: attack', abs(1, 1.3)],
  'combat.aggrDef': ['Aggressive stance: defense', abs(0.8, 1)],
  'combat.defAtk': ['Defensive stance: attack', abs(0.8, 1)],
  'combat.defDef': ['Defensive stance: defense', abs(1, 1.45)],
  'combat.star': ['Veteran star: strength per star', abs(0, 0.15)],
  'combat.militiaAtk': ['City militia: attack', abs(0.6, 1.2)],
  'combat.home': ['Elite unit on its home ground: attack', abs(1, 1.5)],
  'combat.river': ['Attacking across a river: attack', abs(0.6, 1)],
  'combat.flank': ['Attacking from two sides: attack', abs(1, 1.5)],
  'combat.cavRough': ['Cavalry in assaults and on rough ground: attack', abs(0.4, 1)],
  'combat.cavCharge': ['Cavalry charge: first melee round', abs(1, 2.5)],
  'combat.cavLone': ['Cavalry against a foe with almost no horse', abs(1, 1.5)],
  'combat.testudo': ['Testudo: arrow damage taken by legionaries', abs(0.2, 0.8)],
  'combat.wallDef': ['Walls: defense per level', abs(0.2, 0.8)],
  'combat.wallArch': ['Walls: defenders\' archery per level', abs(0, 0.6)],
  'combat.breakAt': ['An army breaks after losing this share of its men', abs(0.35, 0.7)],
  'combat.breakStar': ['Each veteran star holds the line this much longer', abs(0, 0.12)],
  'buildings.farm.food': ['Farmlands: food per second', abs(0.4, 1.8)],
  'buildings.forum.gold': ['Forum: gold per second', abs(0.4, 1.6)],
  'buildings.barracks.speed': ['Barracks: recruiting time', abs(0.5, 0.9)],
  'buildings.barracks.militia': ['Barracks: extra militia', abs(30, 150), true],
  'buildings.temple.loyalty': ['Temple: how much faster order returns', abs(1.5, 5)],
  'buildings.temple.stretch': ['Temple: share of the overstretch penalty it removes', abs(0.2, 0.9)],
  'buildings.fort.time': ['Fort: building time (s)', rel(0.5, 2)],
  'buildings.fort.max': ['Fort: garrison', rel(0.5, 2), true],
  'buildings.fort.walls': ['Fort: wall level', abs(1, 3), true],
  'buildings.fort.guard': ['Fort: squares of countryside it keeps from plunder', abs(3, 10)],
  'perks.rome.build': ['Rome: cost of walls, forts, improvements and siege engines', abs(0.4, 1)],
  'perks.rome.buildTime': ['Rome: building time of walls, forts and improvements', abs(0.3, 1)],
  'perks.carthage.costMul.food': ['Carthage: food to raise a unit', abs(0.4, 1)],
  'perks.carthage.feed': ['Carthage: food to feed its armies', abs(0.4, 1)],
  'perks.carthage.market.buy': ['Carthage: gold to buy 100 at market', abs(80, 130), true],
  'perks.carthage.market.sell': ['Carthage: gold for selling 100', abs(70, 120), true],
  'perks.carthage.port': ['Carthage: gold per second from each coastal city', abs(0, 1.5)],
  'perks.gaul.recruitTime': ['Gaul: recruiting time', abs(0.3, 1)],
  'perks.gaul.unitCost': ['Gaul: cost of every unit', abs(0.5, 1)],
  'perks.egypt.nile': ['Egypt: food from provinces with a river', abs(1, 1.8)],
  'economy.pay': ['Soldiers\' pay: gold per second for 100 men', abs(0.2, 0.8)],
  'economy.market.lot': ['Market: amount bought or sold at a time', abs(100, 100), true],
  'economy.market.buy': ['Market: gold to buy 100', abs(90, 180), true],
  'economy.market.sell': ['Market: gold for selling 100', abs(40, 110), true],
  'economy.plunder': ['A plundered province keeps this share of its land income', abs(0.1, 0.9)],
  'economy.abroad': ['Food eaten by armies abroad, not at war', abs(1, 2)],
  'economy.secure': ['Land income of a province held whole', abs(1, 1.4)],
  'economy.overRate': ['Overstretch: income lost per point of share above fair', abs(0.3, 1.5)],
  'economy.overFloor': ['Overstretch: income never falls below this', abs(0.3, 0.9)],
  'economy.overSlow': ['Overstretch: how much slower conquests settle', abs(0, 6)],
  'economy.fairExtra': ['Fair share of the settlements, above an even split', abs(0, 0.15)],
  'economy.revolt': ['Chance per second that a restless city revolts', abs(0.004, 0.03)],
  'economy.loyalTime': ['Seconds for a conquered city to settle', abs(60, 300)],
  'ai.prov.complete': ['AI: value of the place that completes a province', abs(1, 5)],
  'ai.prov.nearly': ['AI: value of a place that leaves one to take', abs(1, 3)],
  'ai.prov.breaks': ['AI: value of breaking a rival\'s province', abs(1, 2)],
  'ai.prov.breakLeader': ['AI: value of breaking the leader\'s province', abs(1, 3)],
  'ai.prov.fort': ['AI: base value of an enemy fort', abs(0.5, 3)],
  'ai.prov.need': ['AI: odds an army wants before it attacks', abs(0.45, 0.85)],
  'diplomacy.endgame.pressOn': ['Close to victory: unwillingness to make peace', abs(0, 1)],
  'diplomacy.endgame.warRatio': ['Last two powers: strength ratio for war', abs(0.5, 1)],
  'diplomacy.endgame.warChance': ['Last two powers: likelier war', abs(1, 5)],
  'diplomacy.endgame.dispute': ['A shared province as a reason for war', abs(0, 6)],
  'diplomacy.endgame.nearWin': ['Provinces from victory to stop making peace', abs(1, 5), true],
  'diplomacy.endgame.claim': ['Claims on a province: less ready for peace', abs(0, 0.4)],
  'diplomacy.endgame.claimWar': ['Claims on a province: likelier war', abs(0, 3)],
  'diplomacy.rivalry.gangAt': ['The others turn on a power holding this share of the provinces', abs(0.35, 0.6)],
  'diplomacy.rivalry.gangMax': ['How hard they turn on it', abs(0.3, 2)],
  'diplomacy.rivalry.gangK': ['How fast that grows past the threshold', abs(2, 12)],
  'diplomacy.peaceWill': ['Will for peace needed to make it', abs(0.1, 0.6)],
  'diplomacy.tributeFloor': ['Below this will, no tribute buys peace', abs(-0.4, 0.1)],
};
export const RULES = [
  R(/^(units|elite)\.(\w+)\.cost\.(\w+)$/, (m) => m[1], (m) => `${NAMES[m[2]]}: cost in ${m[3]}`, rel(0.5, 2), true),
  R(/^(units|elite)\.(\w+)\.upk$/, (m) => m[1], (m) => `${NAMES[m[2]]}: food upkeep per 100 men`, rel(0.5, 2)),
  R(/^(units|elite)\.(\w+)\.hp$/, (m) => m[1], (m) => `${NAMES[m[2]]}: toughness`, rel(0.6, 1.6)),
  R(/^(units|elite)\.(\w+)\.atk$/, (m) => m[1], (m) => `${NAMES[m[2]]}: attack`, rel(0.6, 1.6)),
  R(/^(units|elite)\.(\w+)\.time$/, (m) => m[1], (m) => `${NAMES[m[2]]}: seconds to recruit`, rel(0.5, 2)),
  R(/^elite\.(\w+)\.vs\.(\w+)$/, 'elite', (m) => `${NAMES[m[1]]}: damage dealt to ${NAMES[m[2]]}`, (v) => [Math.max(0.5, v * 0.6), v * 1.5]),
  R(/^elite\.(\w+)\.hurt\.(\w+)$/, 'elite', (m) => `${NAMES[m[1]]}: damage taken from ${NAMES[m[2]]}`, (v) => [v * 0.6, v * 1.5]),
  R(/^elite\.(\w+)\.shoot$/, 'elite', (m) => `${NAMES[m[1]]}: strength in the opening volleys`, rel(0.5, 1.6)),
  R(/^elite\.(\w+)\.charge$/, 'elite', (m) => `${NAMES[m[1]]}: damage on the first melee round`, (v) => [1, Math.max(1.2, v * 1.5)]),
  R(/^elite\.(\w+)\.cavShy$/, 'elite', (m) => `${NAMES[m[1]]}: how often horses still strike them`, abs(0.1, 0.9)),
  R(/^elite\.(\w+)\.slow$/, 'elite', (m) => `${NAMES[m[1]]}: march speed`, abs(0.6, 1)),
  R(/^elite\.(\w+)\.assault$/, 'elite', (m) => `${NAMES[m[1]]}: attack when storming walls`, abs(0.5, 1.2)),
  R(/^elite\.(\w+)\.rough$/, 'elite', (m) => `${NAMES[m[1]]}: attack on rough ground`, abs(0.4, 1.2)),
  R(/^elite\.(\w+)\.beatsBy$/, 'elite', (m) => `${NAMES[m[1]]}: edge over the elite unit it beats`, abs(1, 1.8)),
  R(/^elite\.(\w+)\.power$/, 'ai', (m) => `AI: what one of its ${NAMES[m[1]]} is worth (a spearman is 1)`, rel(0.6, 1.6)),
  R(/^combat\.vs\.(\w+)\.(\w+)$/, 'combat', (m) => `${ROLE[m[1]]}: damage dealt to ${ROLE[m[2]]}`, (v) => [v * 0.6, v * 1.5]),
  R(/^combat\.twDef\.(\w+)$/, 'combat', (m) => `How much infantry aims at ${ROLE[m[1]]}`, (v) => [v * 0.5, v * 1.6]),
  R(/^combat\.twCav\.(\w+)$/, 'combat', (m) => `How much horsemen aim at ${ROLE[m[1]]}`, (v) => [v * 0.5, v * 1.6]),
  R(/^combat\.terrainDef\.(\d+)$/, 'combat', (m) => `Defending in ${BIOME_OF[m[1]]}`, abs(1, 1.8)),
  R(/^buildings\.(farm|forum|barracks|temple)\.cost\.(\w+)$/, 'buildings', (m) => `${m[1][0].toUpperCase() + m[1].slice(1)}: cost in ${m[2]}`, rel(0.5, 2), true),
  R(/^buildings\.(farm|forum|barracks|temple)\.time$/, 'buildings', (m) => `${m[1][0].toUpperCase() + m[1].slice(1)}: building time (s)`, rel(0.5, 2)),
  R(/^buildings\.walls\.cost\.(\d)\.(\w+)$/, 'buildings', (m) => `Walls level ${+m[1] + 1}: cost in ${m[2]}`, rel(0.5, 2), true),
  R(/^buildings\.walls\.time\.(\d)$/, 'buildings', (m) => `Walls level ${+m[1] + 1}: building time (s)`, rel(0.5, 2)),
  R(/^buildings\.fort\.cost\.(\w+)$/, 'buildings', (m) => `Fort: cost in ${m[1]}`, rel(0.5, 2), true),
  R(/^ai\.mix\.(\d)\.(\w+)$/, 'ai', (m) => `${POWERS[m[1]]}: AI's taste for ${m[2] === 'leg' ? 'its elite unit' : NAMES[m[2]]}`, abs(0.05, 0.7)),
  R(/^ai\.aggr\.(\d)$/, 'ai', (m) => `${POWERS[m[1]]}: how warlike the AI is`, abs(0.2, 1)),
];
export const GROUPS = ['units', 'elite', 'combat', 'buildings', 'perks', 'economy', 'ai', 'diplomacy'];
// every number in BALANCE, in file order
export function buildParams() {
  const out = [];
  const walk = (o, path) => {
    for (const k in o) {
      const v = o[k], id = path ? path + '.' + k : k;
      if (v && typeof v === 'object') { walk(v, id); continue; }
      if (typeof v !== 'number') throw new Error(`balance.js holds numbers only: ${id}`);
      let P = null;
      if (NAMED[id]) { const [label, bounds, int] = NAMED[id]; P = { id, group: id.split('.')[0], label, bounds, int: !!int }; }
      else for (const r of RULES) {
        const m = id.match(r.re); if (!m) continue;
        P = { id, group: typeof r.group === 'function' ? r.group(m) : r.group, label: r.label(m), bounds: r.bounds, int: r.int };
        break;
      }
      if (!P) throw new Error(`no rule for the balance number ${id} (game/params.js)`);
      let [min, max] = P.bounds(v);
      if (P.int) { min = Math.round(min); max = Math.round(max); } else { min = +min.toPrecision(4); max = +max.toPrecision(4); }
      // a zero means the thing doesn't exist (no stone in a spearman, no volley from a legion): the tuner leaves it be
      const fixed = v === 0 || min === max;
      out.push({ id, group: P.group, label: P.label, def: v, min: Math.min(min, v), max: Math.max(max, v), int: P.int, fixed });
    }
  };
  walk(BALANCE, '');
  return out;
}
export const PARAMS = buildParams();
export const PARAM = new Map(PARAMS.map((p) => [p.id, p]));
export const DEFAULTS = Object.fromEntries(PARAMS.map((p) => [p.id, p.def]));
const holder = (id) => { const ks = id.split('.'), last = ks.pop(); let o = BALANCE; for (const k of ks) o = o[k]; return [o, last]; };
export function getParam(id) { if (!PARAM.has(id)) throw new Error(`unknown parameter ${id}`); const [o, k] = holder(id); return o[k]; }
export function setParam(id, v) {
  const P = PARAM.get(id);
  if (!P) throw new Error(`unknown parameter ${id}`);
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${id}: not a number (${v})`);
  const [o, k] = holder(id); o[k] = P.int ? Math.round(v) : v;
}
// the current values, all of them or one group's: { id: value }
export function paramValues(group) { const out = {}; for (const P of PARAMS) if (!group || P.group === group) out[P.id] = getParam(P.id); return out; }
export function applyParams(vals) { for (const id in vals) setParam(id, vals[id]); }
export function resetParams() { applyParams(DEFAULTS); }
// what differs from the defaults (or from base): { id: [from, to] }
export function changedParams(base = DEFAULTS, vals = paramValues()) {
  const out = {};
  for (const id in vals) if (base[id] !== vals[id]) out[id] = [base[id], vals[id]];
  return out;
}
// a short stamp of a set of values (8 hex digits, FNV-1a over the values in file order)
export function paramsHash(vals = paramValues()) {
  let h = 0x811c9dc5;
  const s = PARAMS.map((P) => P.id + '=' + (vals[P.id] ?? getParam(P.id))).join(';');
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}
// balance.js written from the current values (same layout as the file in the repository)
export const BALANCE_HEADER = [
  '// Every number the balance of the game rests on, as plain data. The game reads its live values from here (data.js',
  '// builds the named units, perks and buildings on top of these objects), and the tuner (tools/tune.js) rewrites this file.',
  '// What each number means, its bounds and its group: game/params.js. Keep this file pure data: no imports, no code.',
].join('\n');
export function balanceSource() {
  const flat = (v) => JSON.stringify(v).replace(/":/g, '": ').replace(/,"/g, ', "').replace(/\{"/g, '{ "').replace(/\}/g, ' }').replace(/,(?=[\d{\[-])/g, ', ');
  const lines = [BALANCE_HEADER, 'export const BALANCE = {'];
  const groups = Object.keys(BALANCE);
  groups.forEach((g, gi) => {
    lines.push(`  "${g}": {`);
    const keys = Object.keys(BALANCE[g]);
    keys.forEach((k, ki) => lines.push(`    "${k}": ${flat(BALANCE[g][k])}${ki < keys.length - 1 ? ',' : ''}`));
    lines.push(`  }${gi < groups.length - 1 ? ',' : ''}`);
  });
  lines.push('};', '');
  return lines.join('\n');
}
