import { GS } from './state.js';
import { BIOME } from '../map/generate.js';
import { BALANCE } from './balance.js';

/* =========================================================
   Factions, units, constants
   The numbers live in balance.js (their meaning and bounds in params.js). The objects here are built on top of
   those (their prototype), adding the names and texts, so a tuned value is live everywhere at once and balance.js
   stays pure data. Texts that quote a number are written from the current values.
   ========================================================= */
export const B = BALANCE;
export const COMBAT = B.combat, BUILD = B.buildings, ECON = B.economy, DIPLO = B.diplomacy;
// a number for a text: 0.65 -> "35% less" (less), 1.3 -> "30% more" (more), 0.9 -> "0.9" (num)
export const pctOff = (k) => Math.round(Math.abs(1 - k) * 100) + '%';
export const num = (v) => String(+(+v).toFixed(2));
// a multiplier as a signed change: 1.25 -> "+25%", 0.8 -> "−20%"
export const sgnPct = (k) => (k >= 1 ? '+' : '−') + Math.round(Math.abs(k - 1) * 100) + '%';
// texts written from the current values: obj[key] reads fn() (not enumerable: never saved or copied)
export function textOf(obj, key, fn) { Object.defineProperty(obj, key, { get: fn, enumerable: false, configurable: true }); return obj; }
// an object reading its numbers from base (in balance.js), with names and texts of its own
export const over = (base, props) => Object.assign(Object.create(base), props);
// mix: what the AI likes to recruit ('leg' is the power's own elite unit, see SIG), aggr: how warlike it is (balance.js, ai)
// perk: the power's speciality
//   build: cost of walls, forts and siege engines · buildTime: their construction time
//   costMul: per-resource unit costs · feed: food upkeep · pay: soldiers' pay · recruitTime / unitCost: for every unit
//   nile: food from river provinces · desertMarch: no losses crossing deserts · port: gold/s for every coastal city
// (rates are per second of game time; texts quote them per turn, TURN_TIME seconds)
export const PERK_TEXT = [
  (P) => `Walls, forts, improvements and siege engines cost ${pctOff(P.build)} less, and building takes ${pctOff(P.buildTime)} less time.`,
  (P) => `Hired troops bring their own grain: units need ${P.costMul.food === P.feed ? `${pctOff(P.feed)} less food to raise and to feed` : `${pctOff(P.costMul.food)} less food to raise and ${pctOff(P.feed)} less to feed`}. Punic harbours trade: every coastal city earns ${num(P.port * TURN_TIME)} more gold a turn, and the markets pay better (sell for ${P.market.sell} gold, buy for ${P.market.buy}).`,
  (P) => `Every unit musters ${pctOff(P.recruitTime)} faster and costs ${pctOff(P.unitCost)} less.`,
  (P) => `Provinces with a river grow ${pctOff(P.nile)} more food, and Egyptian armies cross deserts without losses.`,
];
const perk = (base, i, name, extra) => { const P = over(base, Object.assign({ name }, extra)); return textOf(P, 'desc', () => PERK_TEXT[i](P)); };
export const FACTIONS = [
  { name: 'Rome', adj: 'Roman', crest: 'ROMA', color: '#c62a22', css: '#ee4b3c', perk: perk(B.perks.rome, 0, 'Roman engineering') },
  { name: 'Carthage', adj: 'Punic', crest: 'CARTHAGO', color: '#7a3fd0', css: '#ad7bff', perk: perk(B.perks.carthage, 1, 'Mercenaries and merchants') },
  { name: 'Gaul', adj: 'Gallic', crest: 'GALLIA', color: '#1f5fd6', css: '#4c93ff', perk: perk(B.perks.gaul, 2, 'Tribal levies') },
  { name: 'Egypt', adj: 'Egyptian', crest: 'AEGYPTUS', color: '#e8a40c', css: '#ffc72e', perk: perk(B.perks.egypt, 3, 'Gift of the Nile', { desertMarch: true }) },
];
// read when a campaign starts (GS.factions copies them), so a tuned value applies to the next war
FACTIONS.forEach((F, i) => Object.defineProperties(F, {
  mix: { get: () => B.ai.mix[i], enumerable: true },
  aggr: { get: () => B.ai.aggr[i], enumerable: true },
}));
// the power the human plays (any of the four); see setPlayer
export let PLAYER = 0;
export function setPlayer(f) { PLAYER = f; }
export const NEUTRAL = -1;
export const pName = () => FACTIONS[PLAYER].name;
export const pAdj = () => FACTIONS[PLAYER].adj;
// 'Carthage, Gaul and Egypt': every power but f
export function othersOf(f) { const n = FACTIONS.filter((_, i) => i !== f).map((F) => F.name); return n.slice(0, -1).join(', ') + ' and ' + n[n.length - 1]; }
// what the screens say for each power
export const VOICE = [
  { court: 'The Senate awaits your orders.', win: 'The continent kneels before the Senate and People of Rome.', lost: 'The eagles are lost.', leader: 'consul' },
  { court: 'The Council of Elders awaits your orders.', win: 'Every harbour of the continent now pays its dues to Carthage.', lost: 'The fleet burns in the harbour.', leader: 'suffete' },
  { court: 'The chieftains gather round the fire.', win: 'From the forests to the sea, the tribes of Gaul rule the continent.', lost: 'The oppida burn and the torques are taken.', leader: 'chieftain' },
  { court: 'The court of the Pharaoh awaits your word.', win: 'The continent bows before the Pharaoh.', lost: 'The temples fall silent.', leader: 'pharaoh' },
];
export const RES = ['gold', 'food', 'wood', 'stone'];
export const TYPES5 = ['spear', 'leg', 'arch', 'cav', 'siege'];
export const UNITS = {
  spear: over(B.units.spear, { name: 'Spearmen', n: 100, desc: 'Cheap line infantry. Deadly against cavalry.' }),
  leg: null,   // each power's elite unit (SIG), set below
  arch: over(B.units.arch, { name: 'Archers', n: 100, desc: 'Volleys before the melee. Strong behind walls, weak in close combat.' }),
  cav: over(B.units.cav, { name: 'Cavalry', n: 100, desc: 'Fast. Shatters archers and siege engines, impales itself on spears.' }),
  siege: over(B.units.siege, { name: 'Siege engine', n: 1, desc: 'Every 2 engines knock one wall level off a city or fort you assault.' }),
};
/* Each power has its own elite unit. It fills the 'leg' slot of that power's armies, so
   SIG[faction] decides what the slot is and how it fights:
   vs     extra damage it deals, by target type
   hurt   extra damage it takes, by attacker type ('shot' = arrows from archers or chariots)
   shoot  strength per man in the opening volleys (0: it waits for the melee)
   charge damage multiplier on the first melee round
   tw     whom it strikes first in melee ('def' like infantry, 'cav' like horsemen)
   home   biomes where it attacks at +25%
   rough  its attack when attacking into forest and mountains
   assault its attack when storming walls
   good   enemy types the AI recruits it against */
export const SIG = [
  over(B.elite.leg, { key: 'leg', name: 'Legionaries', short: 'legion', n: 100, tw: 'def', testudo: true, beats: 'gae', good: ['spear', 'arch'],
    desc: 'Rome only. Heavy infantry that grinds spearmen and Gaesatae down; in Testudo stance arrows barely hurt them.' }),
  over(B.elite.ele, { key: 'ele', name: 'War elephants', short: 'elephants', n: 100, tw: 'def', beats: 'leg', beast: true, good: ['cav', 'leg'],
    desc: 'Carthage only. They trample legions and break cavalry on the charge, and horses shy away from them; arrows and spears bring them down. Slow, hungry, poor at storming walls.' }),
  over(B.elite.gae, { key: 'gae', name: 'Gaesatae', short: 'gaesatae', n: 100, tw: 'def', home: [BIOME.FOREST, BIOME.HILLS], beats: 'char', good: ['spear', 'arch'],
    desc: 'Gaul only. Cheap, quick to raise and fearless: a ferocious first charge that overruns spearmen and chariots, deadlier still in forests and hills. No armour, so arrows and horsemen hurt.' }),
  over(B.elite.char, { key: 'char', name: 'Chariots', short: 'chariots', n: 100, tw: 'cav', home: [BIOME.DESERT, BIOME.STEPPE], beats: 'ele', mounted: true, beast: true, good: ['arch', 'leg'],
    desc: 'Egypt only. Archers on wheels: they shoot in the opening volleys, then charge, and they run rings around elephants. Fast and fierce in desert and steppe; spears and rough ground stop them.' }),
];
UNITS.leg = SIG[0];
export const sigOf = (f) => SIG[f] || SIG[0];
export const U = (t, f) => (t === 'leg' ? sigOf(f) : UNITS[t]);
// what things actually cost a given power, after its speciality
export const perkOf = (f) => (f >= 0 && FACTIONS[f] ? FACTIONS[f].perk : {});
export const scaleCost = (cost, k) => (k === 1 ? cost : Object.fromEntries(RES.map((r) => [r, Math.round((cost[r] || 0) * k)])));
export const unitCost = (t, f) => {
  const P = perkOf(f), c = scaleCost(U(t, f).cost, (P.unitCost || 1) * (t === 'siege' && P.build ? P.build : 1));
  return P.costMul ? Object.fromEntries(RES.map((r) => [r, Math.round((c[r] || 0) * (P.costMul[r] || 1))])) : c;
};
export const unitTime = (t, f) => U(t, f).time * (perkOf(f).recruitTime || 1);
export const wallCost = (f, level) => scaleCost(BUILD.walls.cost[level - 1], perkOf(f).build || 1);
export const wallTime = (level) => BUILD.walls.time[level - 1];
export const fortCost = (f) => scaleCost(BUILD.fort.cost, perkOf(f).build || 1);
export const buildTime = (f) => perkOf(f).buildTime || 1;
// City improvements: a major city has two slots, a town one. One is built at a time.
export const IMPS = {
  farm: textOf(over(BUILD.farm, { name: 'Farmlands', ico: '🌾' }), 'desc', () => `+${num(BUILD.farm.food * TURN_TIME)} food a turn`),
  forum: textOf(over(BUILD.forum, { name: 'Forum', ico: '🏛' }), 'desc', () => `+${num(BUILD.forum.gold * TURN_TIME)} gold a turn`),
  barracks: textOf(over(BUILD.barracks, { name: 'Barracks', ico: '⚔' }), 'desc', () => `recruits ${pctOff(BUILD.barracks.speed)} faster here, militia +${BUILD.barracks.militia}`),
  temple: textOf(over(BUILD.temple, { name: 'Temple', ico: '🏺' }), 'desc', () => `order returns ${num(BUILD.temple.loyalty)}× faster; ${BUILD.temple.stretch === 0.5 ? 'halves' : `cuts by ${pctOff(BUILD.temple.stretch)}`} the overstretch penalty here`),
};
export const IMP_IDS = Object.keys(IMPS);
export const impSlots = (c) => (c.major ? 2 : 1);
export const impCost = (f, id) => scaleCost(IMPS[id].cost, perkOf(f).build || 1);
export const hasImp = (c, id) => !!(c.imps && c.imps.includes(id));
// gold per second for every 100 men under arms (horses and elephants count twice): ECON.pay
// market: gold paid for, or received for, a lot of food, wood or stone
export const MARKET = ECON.market;
// combat tables (the elite unit's matchups live in SIG): damage multipliers, whom each side strikes first, terrain
export const VS = COMBAT.vs, TW_DEF = COMBAT.twDef, TW_CAV = COMBAT.twCav, TERRAIN_DEF = COMBAT.terrainDef;
export const DIFFS = [
  { name: 'Tiro', note: 'The AI earns 20% less and is slower to attack.', inc: 0.8, need: 0.07, tick: 2.9 },
  { name: 'Legatus', note: 'An even fight.', inc: 1, need: 0, tick: 2.3 },
  { name: 'Imperator', note: 'The AI earns 25% more and strikes sooner.', inc: 1.25, need: -0.07, tick: 1.8 },
];
export const diffOf = () => (GS.auto ? DIFFS[1] : DIFFS[GS.diff == null ? 1 : GS.diff]);
// a turn: the seconds of game time that play out between two rounds of orders (game/turns.js)
export const TURN_TIME = 30;
export const BASE_SPEED = 1.0, PEACE_TIME = 240;
// the others turn on a power holding more than RIVALRY.gangAt of the provinces (five sixths of the way to victory), the harder (up to gangMax) the further past it
export const RIVALRY = B.diplomacy.rivalry;
export const PACT_TIME = 180, TREATY_TIME = 150, OATH_TIME = 240;
