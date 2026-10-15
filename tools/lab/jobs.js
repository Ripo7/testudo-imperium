// What a lab worker can run (tools/lab/worker.js): each export is a job name.
import { applyParams, resetParams } from '../../src/game/params.js';
import { battleLab, scoreBattles, scoreEconomy, total } from './score.js';
import { economyLab } from './economy.js';

export { playLabWar as war } from './war.js';
// the battle and economy labs' scorecard for a set of values (on top of the defaults)
export function fast(params) {
  resetParams(); if (params) applyParams(params);
  const items = scoreBattles(battleLab()).concat(scoreEconomy(economyLab()));
  return { total: total(items), items: items.map((x) => ({ name: x.name, value: x.value, penalty: x.penalty })) };
}
