# Working on Testudo Imperium

Browser RTS in plain JavaScript ES modules, built with Vite, rendered with three.js 0.149.0 (pinned).

## Commands

- `npm run dev`: dev server. `npm run build`: production build into `dist/`.
- `npm run lint`: ESLint for mistakes only (undefined or unused names); a missing import is a runtime error that the build doesn't catch.
- `npm test`: lints, builds, then runs `tests/run.js` (map, smoke, powers, determinism, save & resume) in headless Chromium. Run one suite with `node tests/run.js smoke` after a build.
- `npm run balance -- 60`: AI-vs-AI wars, with the fog of war on (add `--nofog` for full information). Targets: each power wins 20–30%, median war 15–20 min, no war hits the 60-minute limit.
- `npm run audit -- 12`: usage count of every mechanic. If a change makes a mechanic unused or dominant, the audit shows it. Its probes in `tools/audit.js` match code text; update them when you rename that code.

## Module rules

- Every top-level declaration is exported, and imports are explicit and named.
- A module only assigns its own top-level `let` bindings. Other modules go through setters (`setMap`, `setME`, `resetPathfinder`, `resetCrest`), because ES imports are read-only.
- Module top-level code must not depend on other modules' constants at load time. DOM wiring and material patches that need other modules go in `init*()` functions, which `main.js` calls in order (`initAtmosphere`, `initPanel`, `initScreens`).
- The simulation (`src/game/`) must not depend on rendering. Tests run it with `setNoRender(true)` and call `simStep(0.1)` directly.
- `?test` loads `src/debug.js`, which exposes every export of every module (picked up automatically) as `window.__T`.
- Two terrain costs: `MAP.cost` is the builders' cost, used to lay out provinces and roads; changing it changes every map, and so breaks existing saves. `MAP.move` is the marching cost used by armies and pathfinding, and it can be tuned freely (`TERRAIN_MOVE` and `MOVE` in `map/generate.js`).
- Any power can be played: `PLAYER` (in `game/data.js`, set with `setPlayer`) is the human's power and `ME` is `PLAYER`, or `SPECT` in autoplay. Never hard-code Rome in texts: use `pName()`, `pAdj()` and `VOICE[PLAYER]`.
- The record of the war lives in `game/chronicle.js`: events (`GS.chron`), samples of every power's points and men (`GS.hist`) and totals (`GS.fstats`). It is simulation state, so record from the simulation (never from UI hooks) and keep it deterministic. The Overview (`ui/overview.js`) and the end-of-war report (`ui/report.js`) only read it.
- Fog of war lives in `game/sight.js`. Every power has a sight grid, updated inside `simStep`. The AI only uses what it sees (`knowsArmy`, `cityEstimate`, `estimateOdds(..., view)`). On screen, `seesArmy`, `seesBattle` and `seesCity` follow `viewer()`: the player's power, or the followed power in autoplay.

## Behaviour to preserve

- Determinism: with a seeded `Math.random` (and sounds muted), the same seed gives the same game. Don't add wall-clock time or unseeded randomness to the simulation.
- Saves (`src/game/save.js`) must keep loading older saves. Add new fields with defaults on restore rather than breaking the format (as `fillStats`, `chron` and `hist` do).
- Report charts use `FCHART` (in `ui/format.js`), steps of each power's colour checked for colour-blind separation on the dark tablet. Re-check with a palette validator if you change them.
- After a gameplay change, run `npm test`. For balance changes, also run `npm run balance` and `npm run audit`, and update the help screen in `index.html` when a rule changes.
