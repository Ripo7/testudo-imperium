# Testudo Imperium

Real-time strategy in the browser. Play Rome, Carthage, the Gauls or Egypt on a procedurally generated continent: raise armies, wall your cities, plunder enemy provinces, and make peace when the war turns against you.

![A campaign in progress](docs/screenshot-campaign.jpg)

- **Four powers, each with its own elite unit and speciality**: Roman legionaries and engineering, Punic war elephants and merchants, Gallic gaesatae and tribal levies, Egyptian chariots and the gift of the Nile.
- **Terrain matters on the march**: armies go twice as fast on roads, slowly through forests and very slowly over mountains, and wide rivers can only be crossed on a bridge (narrow streams can be waded).
- **Fog of war, for everyone**: each power, the AI included, only sees the land around its cities, armies and forts; cavalry and high ground see further. The AI judges unseen cities by its last report.
- **Battles decided by strategy**: terrain, rivers, walls, flanks, stance and the odds you accept. Retreat when a battle turns.
- **An economy of land and cities**: provinces share their land income between settlements, cities take improvements (farmlands, forum, barracks, temple), soldiers draw pay, and conquered cities can revolt.
- **War and peace**: powers stay at peace until one declares war. Wars wear both sides down until they sign a treaty, with tribute paid by the loser.
- **Autoplay** to watch four AI empires fight it out through the eyes of the power you follow, and take command of it at any moment. Three difficulty levels, and saves that survive closing the tab.

Everything is procedural and drawn in code: the map, the painted terrain, the trees, cities, soldiers and the synthesized sound.

## Run it locally

You need [Node.js](https://nodejs.org) 20.19 or newer.

```sh
npm install
npm run dev
```

Then open the address Vite prints (usually http://localhost:5173). Edits to the code reload the page.

| Command | What it does |
|---|---|
| `npm run dev` | Development server with live reload |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Check the code for mistakes (undefined or unused names) |
| `npm test` | Lint, build, then run the test suite in headless Chromium |
| `npm run balance -- 40` | Play 40 AI-vs-AI wars and report win rates, war length and economy |
| `npm run audit -- 12` | Count how often every mechanic is used across 12 AI wars |

The browser tests need Chromium once: `npx playwright install chromium`.

## Project layout

```
index.html            page markup: HUD, panels, title and help screens
src/
  main.js             boot and the frame loop
  three.js            three.js, set up once (colour management)
  debug.js            test hook, loaded only with ?test
  styles/main.css     all the UI styling (colour tokens at the top)
  assets/fonts/       Marcellus and Alegreya Sans
  core/               helpers, synthesized audio
  map/generate.js     the continent: relief, biomes, rivers, provinces, cities, roads,
                      bridges, fords and the marching cost of every cell (pure JS)
  render/             everything drawn in 3D: terrain, water, vegetation, cities,
                      soldiers (instanced crowds), overlays, camera, light and clouds
  game/               the simulation: factions and units (data.js), armies and pathfinding,
                      battles, economy, standing and victory, diplomacy, AI, fog of war
                      (sight.js), save & resume
  ui/                 panels, HUD, map labels, input, screens, the autoplay camera
tests/                Node and browser tests (npm test)
tools/                balance and audit scripts
```

The simulation in `src/game` advances in fixed steps (`simStep`) and doesn't depend on rendering, which is what lets the tests and tools play whole wars in seconds with the renderer switched off.

Saves live in the browser's `localStorage` under `testudo.save.v1`. Only the changing state is stored; the map is rebuilt from its seed. If you change the save format, keep `restoreGame` able to read older saves (it already upgrades saves from before the war and peace system).

## Tests

`npm test` builds the game and runs:

- **map**: map generation is deterministic and every province has its cities (plain Node).
- **smoke**: a campaign plays on desktop and phone sizes, every panel renders, the fog hides what it should, no console errors.
- **powers**: another power (Carthage) can be played and resumed, autoplay is seen through the followed power's eyes, and you can take command of it.
- **determinism**: the same seed and the same random numbers give exactly the same game.
- **save & resume**: play, close the tab, reopen, and check the restored game matches the save exactly.

GitHub Actions runs the same suite on every push and pull request (`.github/workflows/ci.yml`).

For balance work, `npm run balance` and `npm run audit` play AI wars and print the numbers that matter: win rates per power (aim for 20–30% each), war length, elite share of recruits, how many wars run at once, and how often walls, forts, markets, improvements, retreats, revolts and peace treaties are used.

## Deploy on Vercel

1. On [vercel.com](https://vercel.com), choose **Add New → Project** and import this GitHub repository.
2. Vercel detects Vite. Keep the defaults: build command `npm run build`, output directory `dist`.
3. Deploy. From then on, every push to `main` updates the live site, and every pull request gets its own preview link.

The game is a static site, so any static host works too (Netlify, Cloudflare Pages, GitHub Pages). Vercel's free Hobby plan is meant for personal, non-commercial projects.

## Improving the visuals

- **Interface**: `src/styles/main.css` and the markup in `index.html`. Colours are CSS variables at the top of the stylesheet.
- **3D world**: each part has its own module in `src/render/`. Soldiers are in `crowds.js` (instanced, so hundreds stay cheap), cities and walls in `cities.js`, the painted ground in `terrain.js`, light, shadows and clouds in `atmosphere.js`.
- **Real 3D models**: put `.glb` files in `public/models/` and load them with three.js's `GLTFLoader` (`three/examples/jsm/loaders/GLTFLoader.js`). Keep instancing for armies.
- **three.js** is pinned to 0.149.0. Upgrading past r152 changes colour management and r155 changes light intensities, so plan a visual pass when you upgrade.

## Known issues

- Sound effects draw from `Math.random`, the same generator the AI uses, so a game only replays identically with sound off (the determinism test mutes it). Giving the simulation its own seeded generator would fix that and allow replays.
- The AI almost never attacks from two sides, so flanking is mostly a player tactic.

## Credits and licence

Fonts: Marcellus and Alegreya Sans, under the SIL Open Font License 1.1.

No licence has been chosen for the code yet, which means all rights are reserved by default. Add a `LICENSE` file if you want others to be able to reuse it.
