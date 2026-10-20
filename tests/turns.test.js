// Turns in the simulation (plain Node, a few seconds): the AI gives its armies orders once a turn, at its start, and
// never in between; a battle plainly lost is broken off without waiting for an order; an aggressive army that takes a
// place presses on to the next one of the province; envoys wait for the player's next orders.
import { check } from './helpers.js';
import { newWar, playUntil, STEP } from '../tools/headless.js';
import { simStep } from '../src/game/sim.js';
import { GS, MAP, cellOf, menOf } from '../src/game/state.js';
import { NEUTRAL, TURN_TIME } from '../src/game/data.js';
import { makeArmy, orderTarget } from '../src/game/armies.js';
import { declareWar, sendEnvoy } from '../src/game/diplomacy.js';
import { placesOf } from '../src/game/standing.js';
import { turnEndOf, turnOf, turnsTxt } from '../src/game/turns.js';

export default async function turns() {
  // the AI's orders: given at the start of a turn only (aiPlan stamps aiCommit on every army it sends)
  newWar(4242, { fog: true });
  let off = 0, given = 0;
  const seen = new Map();
  while (GS.time < 8 * TURN_TIME && !GS.over) {
    const t0 = GS.time;
    for (const a of GS.armies) seen.set(a.id, a.aiCommit || 0);
    simStep(STEP);
    for (const a of GS.armies) {
      if (a.dead || !a.aiCommit || a.aiCommit === seen.get(a.id)) continue;
      given++;
      if (Math.abs(t0 - Math.round(t0 / TURN_TIME) * TURN_TIME) > 0.05) off++;
    }
  }
  check(given > 10 && off === 0, `the AI orders its armies at the start of each turn only (${given} orders over 8 turns, ${off} in between)`);
  playUntil(9.5 * TURN_TIME);
  check(Math.abs(GS.planAt - 10 * TURN_TIME) < 1e-6, `the next plans are due at the end of the turn under way (turn ${turnOf(GS.time)}, due at ${GS.planAt.toFixed(1)} s)`);

  // a battle plainly lost is broken off by the army itself, whoever commands it (here the player's, no AI behind it)
  newWar(777, { fog: false });
  simStep(STEP);   // the opening plans are made
  const open = (x, y) => MAP.move[cellOf(x, y)] < 1.5 && GS.cityAt[cellOf(x, y)] < 0;
  let spot = null;
  for (let y = 10; y < MAP.H - 10 && !spot; y += 3) for (let x = 10; x < MAP.W - 10 && !spot; x += 3) {
    if (open(x, y) && open(x + 1, y) && MAP.cities.every((c) => Math.hypot(c.x - x, c.y - y) > 8) && GS.armies.every((a) => Math.hypot(a.x - x, a.y - y) > 10)) spot = { x, y };
  }
  GS.factions[0].isPlayer = true;
  declareWar(1, 0);
  const weak = makeArmy(0, { spear: 500, arch: 200 }, spot.x, spot.y), strong = makeArmy(1, { spear: 1300, leg: 500 }, spot.x + 1, spot.y);
  weak.stance = 'aggr'; strong.stance = 'aggr';
  let rounds = 0;
  while (GS.time < 25 && !weak.dead && !weak.retreated) { simStep(STEP); if (weak.battle) rounds = weak.battle.round; }
  check(!weak.dead && weak.retreated && weak.state === 'rout' && menOf(weak.comp) > 120, `a beaten army falls back by itself (after ${rounds} rounds, ${menOf(weak.comp)} men saved)`);
  GS.factions[0].isPlayer = false;

  // an aggressive army that takes a place presses on to the next free one of its province
  newWar(31337, { fog: false });
  simStep(STEP);
  const P = MAP.provinces.find((Pv) => Pv.small.length >= 1 && placesOf(Pv).every((p) => p.ref.owner === NEUTRAL) && !GS.armies.some((a) => Math.hypot(a.x - MAP.cities[Pv.major].x, a.y - MAP.cities[Pv.major].y) < 15));
  const major = MAP.cities[P.major];
  GS.factions[2].isPlayer = true;
  const host = makeArmy(2, { spear: 2500, leg: 2500, arch: 1500, cav: 500 }, major.x + 1.2, major.y + 1.2);
  host.stance = 'aggr';
  orderTarget(host, 'city', major);
  while (GS.time < 25 && major.owner !== 2 && !host.dead) simStep(STEP);
  const next = host.target && host.target.ref;
  check(major.owner === 2 && !!next && next !== major && placesOf(P).some((p) => p.ref === next) && next.owner !== 2,
    `having taken ${major.name}, the army marches on ${next ? next.name : 'nothing'} in ${P.name}`);
  host.stance = 'def';
  GS.factions[2].isPlayer = false;

  // envoys wait until the end of the next turn, so the player has a turn's orders to answer them
  newWar(99, { fog: false });
  playUntil(1.5 * TURN_TIME);
  GS.factions[0].isPlayer = true;
  sendEnvoy(1, 0);
  check(GS.envoy && Math.abs(GS.envoy.until - (turnEndOf(GS.time) + TURN_TIME)) < 1e-6, `envoys wait until the end of the next turn (sent at ${GS.time.toFixed(0)} s, until ${GS.envoy && GS.envoy.until} s)`);
  check(turnsTxt(1) === '1 turn' && turnsTxt(TURN_TIME * 5) === '5 turns' && turnsTxt(TURN_TIME * 5 + 1) === '6 turns', 'durations are told in turns, a part of one counting as one');
}
