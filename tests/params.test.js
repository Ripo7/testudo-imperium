// Parameters and labs (plain Node, a few seconds): every balance number has a meaning and bounds, balance.js writes
// back exactly, a value set at run time reaches the game, and the battle lab is deterministic and fair to itself.
import { check } from './helpers.js';
import { applyParams, balanceSource, DEFAULTS, getParam, PARAMS, paramsHash, paramValues, resetParams, setParam } from '../src/game/params.js';
import { BALANCE } from '../src/game/balance.js';
import { IMPS, perkOf, UNITS } from '../src/game/data.js';
import { edge, matchups } from '../tools/lab/battle.js';
import { fastScore } from '../tools/lab/score.js';

export default async function params() {
  check(PARAMS.length >= 200 && PARAMS.every((P) => P.label && P.min <= P.def && P.def <= P.max), `${PARAMS.length} balance numbers, each with a meaning and bounds around its value`);
  const src = balanceSource(), body = JSON.parse(src.slice(src.indexOf('{'), src.lastIndexOf('}') + 1));
  check(JSON.stringify(body) === JSON.stringify(BALANCE), 'balance.js written back from the values is the same data');
  const h0 = paramsHash();
  setParam('units.spear.atk', 0.9); setParam('buildings.farm.food', 1.1); setParam('perks.carthage.port', 0.8);
  check(UNITS.spear.atk === 0.9 && IMPS.farm.desc === '+33 food a turn' && perkOf(1).port === 0.8 && perkOf(1).desc.includes('24 more gold a turn'), 'a value set at run time reaches the units, the buildings, the perks and their texts');
  check(paramsHash() !== h0, 'the stamp of a set of values changes with them');
  resetParams();
  check(getParam('units.spear.atk') === DEFAULTS['units.spear.atk'] && paramsHash() === h0, 'reset brings every value back');
  let threw = false; try { setParam('units.spear.nope', 1); } catch (e) { threw = true; }
  check(threw, 'an unknown parameter is refused');
  const M1 = JSON.stringify(matchups()), M2 = JSON.stringify(matchups());
  check(M1 === M2, 'the battle lab is deterministic');
  const self = edge('spear', 0, 'spear', 1);
  check(Math.abs(self) < 0.02, `two equal armies come out even (edge ${self.toFixed(3)})`);
  applyParams({ 'units.cav.atk': getParam('units.cav.atk') * 1.3 });
  const up = edge('cav', 0, 'spear', 1);
  resetParams();
  check(up > edge('cav', 0, 'spear', 1), 'stronger cavalry fares better against spearmen');
  const s = fastScore();
  check(s.items.length > 20 && Number.isFinite(s.total), `the fast scorecard: ${s.items.length} measures, penalty ${s.total.toFixed(2)}`);
  check(JSON.stringify(paramValues()) === JSON.stringify(DEFAULTS), 'the labs leave the values as they found them');
}
