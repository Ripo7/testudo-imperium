# Working on Testudo Imperium

Browser RTS in plain JavaScript ES modules, built with Vite, rendered with three.js 0.149.0 (pinned).

## Commands

- `npm run dev`: dev server. `npm run build`: production build into `dist/`.
- `npm test`: builds, then runs `tests/run.js` (map, smoke, determinism, save & resume) in headless Chromium. Run one suite with `node tests/run.js smoke` after a build.
- `npm run balance -- 60`: AI-vs-AI wars. Targets: each power wins 20–30%, median war 15–20 min, no war hits the 60-minute limit.
- `npm run audit -- 12`: usage count of every mechanic. If a change makes a mechanic unused or dominant, the audit shows it. Its probes in `tools/audit.js` match code text; update them when you rename that code.

## Module rules

- Every top-level declaration is exported, and imports are explicit and named.
- A module only assigns its own top-level `let` bindings. Other modules go through setters (`setMap`, `setME`, `resetPathfinder`, `resetCrest`), because ES imports are read-only.
- Module top-level code must not depend on other modules' constants at load time. DOM wiring and material patches that need other modules go in `init*()` functions, which `main.js` calls in order (`initAtmosphere`, `initPanel`, `initScreens`).
- The simulation (`src/game/`) must not depend on rendering. Tests run it with `setNoRender(true)` and call `simStep(0.1)` directly.
- `?test` loads `src/debug.js`, which exposes every module export as `window.__T`.

## Behaviour to preserve

- Determinism: with a seeded `Math.random` (and sounds muted), the same seed gives the same game. Don't add wall-clock time or unseeded randomness to the simulation.
- Saves (`src/game/save.js`) must keep loading older saves. Add new fields with defaults on restore rather than breaking the format.
- After a gameplay change, run `npm test`. For balance changes, also run `npm run balance` and `npm run audit`, and update the help screen in `index.html` when a rule changes.
