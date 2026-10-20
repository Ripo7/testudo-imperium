// What "well balanced" means: the targets the scorecard checks and the tuner aims for. Edit these to change the goal.
// Every target has a band [low, high]; outside it, the penalty grows with the square of the distance, times its weight.
export const TARGETS = {
  // the battle lab (equal worth, no dice). Edges run from -1 to 1 (see tools/lab/battle.js)
  battles: {
    // the counters the game promises (unit descriptions and help screen): the first beats the second by at least this edge
    counters: {
      band: [0.12, 0.6], weight: 4,
      pairs: [
        ['spear', 'cav'], ['cav', 'arch'],
        ['leg@0', 'spear'], ['leg@0', 'arch'], ['leg@0', 'leg@2'],            // legionaries grind spearmen and gaesatae down
        ['leg@1', 'leg@0'], ['leg@1', 'cav'], ['arch', 'leg@1'],              // elephants trample legions, break horse; arrows bring them down
        ['leg@2', 'spear'], ['leg@2', 'leg@3'], ['arch', 'leg@2'], ['cav', 'leg@2'],   // gaesatae overrun spears and chariots; arrows and horse hurt
        ['leg@3', 'arch'], ['leg@3', 'leg@1'], ['spear', 'leg@3'],            // chariots ride archers down, run rings round elephants; spears stop them
      ],
    },
    // no fighter is the best buy everywhere: its mean edge over all the others
    dominance: { band: [-0.15, 0.15], weight: 3 },
    // each power's usual army against the others', at equal worth: its mean edge (open ground)
    powerArmies: { band: [-0.08, 0.08], weight: 2 },
  },
  economy: {
    // seconds for an income improvement to pay for itself
    payback: { band: [180, 420], weight: 1 },
    // walls: extra attacking worth needed for every resource spent on a level
    wallLeverage: { band: [1.5, 5], weight: 1 },
    // siege engines (2 per wall level): worth needed with them / without them, at walls 2 and 3. Below 1, they pay
    // for themselves in a single assault; a little above is fair, as an army keeps its engines for the next one
    engines: { band: [0.6, 1.05], weight: 1 },
  },
  wars: {
    // each power's share of the wins
    winShare: { band: [0.2, 0.3], weight: 10 },
    // guardrails: the median war in minutes of game time (a turn is 30 s: 20–30 min is 40–60 turns), and the share of
    // wars still going at the time limit
    medianMin: { band: [20, 30], weight: 4 },
    unfinished: { band: [0, 0.07], weight: 4 },
    // every mechanic in use: share of all units raised (by men) of each common type, per power
    unitShare: { band: [0.06, 0.55], weight: 1 },
    // improvements built per war, per power, of each kind
    impsPerWar: { band: [0.5, 25], weight: 1 },
    // per war: forts built, retreats, revolts, peace treaties (all powers together)
    forts: { band: [1, 12], weight: 1 },
    retreats: { band: [2, 40], weight: 0.5 },
    revolts: { band: [1, 12], weight: 0.5 },
    peaces: { band: [2, 20], weight: 0.5 },
  },
  // the fairness levers: one parameter per power that the tuner moves to bring its share of the wins into the band,
  // and which way makes the power stronger (+1: a higher value). Perks: they don't count in the battle lab's
  // equal-worth fights, so moving them leaves the units' balance alone.
  levers: [
    ['perks.rome.build', -1],
    ['perks.carthage.feed', -1],
    ['perks.gaul.unitCost', -1],
    ['perks.egypt.nile', 1],
  ],
};
