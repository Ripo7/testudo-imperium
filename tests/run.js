// Runs the browser tests against the production build in dist/ (npm test builds it first).
import { failed } from './helpers.js';
import map from './map.test.js';
import smoke from './smoke.test.js';
import powers from './powers.test.js';
import determinism from './determinism.test.js';
import saveResume from './save-resume.test.js';
import controls from './controls.test.js';
import headless from './headless.test.js';

const suites = { map, smoke, controls, powers, determinism, headless, 'save & resume': saveResume };
const only = process.argv[2];
for (const [name, fn] of Object.entries(suites)) {
  if (only && !name.startsWith(only)) continue;
  console.log(`\n== ${name}`);
  const t0 = Date.now();
  await fn();
  console.log(`   (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}
const n = failed();
console.log(n ? `\n${n} check(s) FAILED` : '\nALL PASSED');
process.exit(n ? 1 : 0);
