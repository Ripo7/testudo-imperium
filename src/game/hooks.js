/* =========================================================
   What the simulation tells the world around it
   The simulation never touches the screen, the sounds or the browser: it reports what happens through
   these hooks. In the browser, the HUD and the renderer fill them in at start-up (initHooks in
   ui/hud.js); headless runs (the tests' and the tuning tools' wars in Node) leave them doing nothing.
   A hook may show, sound or log, but must never change the state of the game.
   ========================================================= */
export const none = () => {};
export const HOOKS = {
  battleStart: none,     // (B)
  battleEnd: none,       // (B)
  retreated: none,       // (army, share of it lost to the pursuit)
  cityCaptured: none,    // (city, previous owner, new owner; -1 when it revolts)
  cityChanged: none,     // (city): its look changed (owner, walls, buildings)
  fortBuilt: none,       // (fort)
  fortChanged: none,     // (fort): building progress
  fortRemoved: none,     // (fort)
  recruited: none,       // (city, unit type, army)
  wallsDone: none,       // (city)
  impDone: none,         // (city, improvement id)
  armiesMerged: none,    // (into, from)
  warDeclared: none,     // (f, g, broke: it broke a treaty)
  peaceMade: none,       // (f, g, payer, gold paid)
  envoy: none,           // (GS.envoy): an AI power's envoys come to the player, or (null) leave
  eliminated: none,      // (faction)
  warOver: none,         // (): GS.over is set: 'win', 'lose' or 'auto' (GS.winner)
};
export function setHooks(h) { Object.assign(HOOKS, h); }
