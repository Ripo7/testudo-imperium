// Test and debugging hook: open the game with ?test to expose its internals as window.__T.
// The scripts in tests/ and tools/ drive the simulation through it. Normal players never load this file.
import * as main from './main.js';

// every module of the game (new modules are picked up automatically)
const spaces = Object.values(import.meta.glob(['./**/*.js', '!./debug.js'], { eager: true }));
const extras = {
  setNoRender: (v) => main.setTestNoRender(v),
  setFreeze: (v) => main.setTestFreeze(v),
};
// module namespaces are live views, so MAP, ME and the like always read their current value
window.__T = new Proxy(extras, {
  get(target, key) {
    if (key in target) return target[key];
    for (const ns of spaces) if (key in ns) return ns[key];
    return undefined;
  },
  has(target, key) { return key in target || spaces.some((ns) => key in ns); },
});
