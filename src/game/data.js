import { GS } from './state.js';
import { BIOME } from '../map/generate.js';

/* =========================================================
   Factions, units, constants
   ========================================================= */
// mix: what the AI likes to recruit ('leg' is the power's own elite unit, see SIG)
// perk: the power's speciality
//   build: cost of walls, forts and siege engines · buildTime: their construction time
//   costMul: per-resource unit costs · feed: food upkeep · pay: soldiers' pay · recruitTime / unitCost: for every unit
//   nile: food from river provinces · desertMarch: no losses crossing deserts
export const FACTIONS = [
  { name: 'Rome', adj: 'Roman', crest: 'ROMA', color: '#c62a22', css: '#ee4b3c', mix: { spear: 0.25, leg: 0.45, arch: 0.15, cav: 0.15 }, aggr: 0.6,
    perk: { name: 'Roman engineering', desc: 'Walls, forts and siege engines cost a third less and go up 40% faster.', build: 0.67, buildTime: 0.6 } },
  { name: 'Carthage', adj: 'Punic', crest: 'CARTHAGO', color: '#7a3fd0', css: '#ad7bff', mix: { spear: 0.35, leg: 0.3, arch: 0.15, cav: 0.2 }, aggr: 0.6,
    perk: { name: 'Mercenaries and merchants', desc: 'Hired troops bring their own grain: units need 35% less food to raise and to feed. Punic traders get better market prices (sell for 95 gold, buy for 110).', costMul: { food: 0.65 }, feed: 0.65, market: { buy: 110, sell: 95 } } },
  { name: 'Gaul', adj: 'Gallic', crest: 'GALLIA', color: '#1f5fd6', css: '#4c93ff', mix: { spear: 0.25, leg: 0.4, arch: 0.1, cav: 0.25 }, aggr: 0.85,
    perk: { name: 'Tribal levies', desc: 'Every unit musters 40% faster and costs 20% less.', recruitTime: 0.6, unitCost: 0.8 } },
  { name: 'Egypt', adj: 'Egyptian', crest: 'AEGYPTUS', color: '#e8a40c', css: '#ffc72e', mix: { spear: 0.3, leg: 0.35, arch: 0.2, cav: 0.15 }, aggr: 0.6,
    perk: { name: 'Gift of the Nile', desc: 'Provinces with a river grow 30% more food, and Egyptian armies cross deserts without losses.', nile: 1.3, desertMarch: true } },
];
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
  spear: { name: 'Spearmen', cost: { gold: 40, food: 75, wood: 50, stone: 0 }, upk: 0.4, hp: 1.0, atk: 0.78, time: 8, n: 100, desc: 'Cheap line infantry. Deadly against cavalry.' },
  leg: { name: 'Legionaries', cost: { gold: 110, food: 100, wood: 25, stone: 40 }, upk: 0.45, hp: 1.6, atk: 1.45, time: 12, n: 100, desc: 'Heavy infantry. Grinds spearmen down; in testudo stance arrows barely hurt them.' },
  arch: { name: 'Archers', cost: { gold: 40, food: 50, wood: 85, stone: 0 }, upk: 0.35, hp: 0.9, atk: 0.6, time: 9, n: 100, desc: 'Volleys before the melee. Strong behind walls, weak in close combat.' },
  cav: { name: 'Cavalry', cost: { gold: 130, food: 120, wood: 30, stone: 0 }, upk: 0.7, hp: 1.6, atk: 1.6, time: 14, n: 100, desc: 'Fast. Shatters archers and siege engines, impales itself on spears.' },
  siege: { name: 'Siege engine', cost: { gold: 75, food: 0, wood: 175, stone: 100 }, upk: 0.15, hp: 25, atk: 0.5, time: 16, n: 1, desc: 'Every 2 engines knock one wall level off a city or fort you assault.' },
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
  { key: 'leg', name: 'Legionaries', short: 'legion', cost: { gold: 115, food: 105, wood: 25, stone: 45 }, upk: 0.5, hp: 1.6, atk: 1.45, time: 12, n: 100,
    vs: { spear: 1.3, arch: 1.2 }, hurt: { cav: 0.9 }, shoot: 0, charge: 1, tw: 'def', testudo: true, beats: 'gae', beatsBy: 1.35, power: 2.2, good: ['spear', 'arch'],
    desc: 'Rome only. Heavy infantry that grinds spearmen and Gaesatae down; in Testudo stance arrows barely hurt them.' },
  { key: 'ele', name: 'War elephants', short: 'elephants', cost: { gold: 150, food: 130, wood: 25, stone: 0 }, upk: 0.65, hp: 2.3, atk: 1.2, time: 16, n: 100,
    vs: { spear: 1.1, cav: 1.6 }, hurt: { shot: 1.35, spear: 1.1, cav: 0.6 }, shoot: 0, charge: 2.0, tw: 'def', cavShy: 0.3, slow: 0.85, assault: 0.85, beats: 'leg', beatsBy: 1.18, beast: true, power: 3.0, good: ['cav', 'leg'],
    desc: 'Carthage only. They trample legions and break cavalry on the charge, and horses shy away from them; arrows and spears bring them down. Slow, hungry, poor at storming walls.' },
  { key: 'gae', name: 'Gaesatae', short: 'gaesatae', cost: { gold: 70, food: 90, wood: 45, stone: 0 }, upk: 0.4, hp: 1.05, atk: 1.3, time: 7, n: 100,
    vs: { spear: 1.2, arch: 1.5 }, hurt: { shot: 1.2, cav: 1.2 }, shoot: 0, charge: 1.8, tw: 'def', home: [BIOME.FOREST, BIOME.HILLS], beats: 'char', beatsBy: 1.4, power: 1.7, good: ['spear', 'arch'],
    desc: 'Gaul only. Cheap, quick to raise and fearless: a ferocious first charge that overruns spearmen and chariots, deadlier still in forests and hills. No armour, so arrows and horsemen hurt.' },
  { key: 'char', name: 'Chariots', short: 'chariots', cost: { gold: 115, food: 90, wood: 50, stone: 0 }, upk: 0.5, hp: 1.5, atk: 1.3, time: 13, n: 100,
    vs: { arch: 1.6, siege: 2.0 }, hurt: { spear: 2.0 }, shoot: 0.75, charge: 1.6, tw: 'cav', home: [BIOME.DESERT, BIOME.STEPPE], rough: 0.6, assault: 0.95, beats: 'ele', beatsBy: 1.18, mounted: true, beast: true, power: 2.4, good: ['arch', 'leg'],
    desc: 'Egypt only. Archers on wheels: they shoot in the opening volleys, then charge, and they run rings around elephants. Fast and fierce in desert and steppe; spears and rough ground stop them.' },
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
export const wallCost = (f, level) => scaleCost(WALL_COST[level], perkOf(f).build || 1);
export const fortCost = (f) => scaleCost(FORT_COST, perkOf(f).build || 1);
export const buildTime = (f) => perkOf(f).buildTime || 1;
// City improvements: a major city has two slots, a town one. One is built at a time.
export const IMPS = {
  farm:     { name: 'Farmlands', ico: '🌾', desc: '+0.9 food/s', cost: { gold: 90, food: 0, wood: 60, stone: 30 }, time: 30 },
  forum:    { name: 'Forum', ico: '🏛', desc: '+0.8 gold/s', cost: { gold: 70, food: 0, wood: 50, stone: 80 }, time: 30 },
  barracks: { name: 'Barracks', ico: '⚔', desc: 'recruits 30% faster here, militia +70', cost: { gold: 110, food: 0, wood: 70, stone: 60 }, time: 28 },
  temple:   { name: 'Temple', ico: '🏺', desc: 'order returns 3× faster; halves the overstretch penalty here', cost: { gold: 80, food: 0, wood: 30, stone: 100 }, time: 34 },
};
export const IMP_IDS = Object.keys(IMPS);
export const impSlots = (c) => (c.major ? 2 : 1);
export const impCost = (f, id) => scaleCost(IMPS[id].cost, perkOf(f).build || 1);
export const hasImp = (c, id) => !!(c.imps && c.imps.includes(id));
export const PAY = 0.4;
// gold per second for every 100 men under arms (horses and elephants count twice)
export const MARKET = { lot: 100, buy: 130, sell: 70 };
export const WALL_COST = [null, { gold: 30, food: 0, wood: 50, stone: 150 }, { gold: 60, food: 0, wood: 80, stone: 320 }, { gold: 120, food: 0, wood: 120, stone: 550 }];
// walls are mostly stone
export const WALL_TIME = [0, 10, 15, 20];
export const FORT_COST = { gold: 80, food: 0, wood: 120, stone: 200 };
export const FORT_TIME = 15, FORT_MAX = 220, FORT_WALLS = 2;
export const VS = { spear: { cav: 1.9 }, cav: { arch: 2.0, siege: 2.0, spear: 0.6 } };
// the elite unit's matchups live in SIG
export const TW_DEF = { spear: 1.2, leg: 1.2, arch: 0.6, cav: 0.9, siege: 0.4 };
export const TW_CAV = { spear: 0.6, leg: 0.8, arch: 2.5, cav: 1.0, siege: 2.5 };
export const TERRAIN_DEF = { 5: 1.2, 7: 1.25, 8: 1.5, 9: 1.5 };
export const BALN = { archR: 1.15, archM: 0.5, rr: 3 };
export const DIFFS = [
  { name: 'Tiro', note: 'The AI earns 20% less and is slower to attack.', inc: 0.8, need: 0.07, tick: 2.9 },
  { name: 'Legatus', note: 'An even fight.', inc: 1, need: 0, tick: 2.3 },
  { name: 'Imperator', note: 'The AI earns 25% more and strikes sooner.', inc: 1.25, need: -0.07, tick: 1.8 },
];
export const diffOf = () => (GS.auto ? DIFFS[1] : DIFFS[GS.diff == null ? 1 : GS.diff]);
export const K_DMG = 0.075, ROUND_T = 0.55, BASE_SPEED = 0.8, LOYAL_TIME = 150, PEACE_TIME = 240;
// Settlement points: a major city counts 3, a town 1. Victory, the empire's size and the land income all go by these.
export const GANG_AT = 0.36, PACT_TIME = 180, TREATY_TIME = 150, OATH_TIME = 240, PEACE_WILL = 0.3, TRIBUTE_FLOOR = -0.1;
export const FORT_GUARD = 6, PLUNDER = 0.4, REVOLT_RATE = 0.012;
