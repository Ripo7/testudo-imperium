/* =========================================================
   Pure helpers: no browser, no three.js, so the simulation can use them in Node too
   ========================================================= */
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
/* The simulation's trigonometry, from + − × ÷ alone. JavaScript engines disagree on the last bit of Math.sin, Math.cos
   and Math.pow (Node's and Chromium's do, for a few inputs in a hundred), and a war played in Node must be exactly the
   browser's (tests/headless.test.js): src/game uses these instead. */
// an angle brought into [-π, π)
export const wrapAngle = (x) => x - TAU * Math.floor((x + Math.PI) / TAU);
const PIO2_HI = 1.5707963267341256, PIO2_LO = 6.077100506506192e-11;   // π/2 in two parts, for an exact reduction
// sine and cosine together: { s, c }, to about 1e-16
export function sinCos(x) {
  const k = Math.round(x / (PIO2_HI + PIO2_LO)), r = (x - k * PIO2_HI) - k * PIO2_LO, r2 = r * r;
  // Taylor series on [-π/4, π/4]
  const s = r * (1 + r2 * (-1 / 6 + r2 * (1 / 120 + r2 * (-1 / 5040 + r2 * (1 / 362880 + r2 * (-1 / 39916800 + r2 * (1 / 6227020800 + r2 * (-1 / 1307674368000))))))));
  const c = 1 + r2 * (-1 / 2 + r2 * (1 / 24 + r2 * (-1 / 720 + r2 * (1 / 40320 + r2 * (-1 / 3628800 + r2 * (1 / 479001600 + r2 * (-1 / 87178291200 + r2 / 20922789888000)))))));
  switch (((k % 4) + 4) % 4) {
    case 0: return { s, c };
    case 1: return { s: c, c: -s };
    case 2: return { s: -s, c: -c };
    default: return { s: -c, c: s };
  }
}
export const dsin = (x) => sinCos(x).s;
export const dcos = (x) => sinCos(x).c;
export const dampAngle = (a, b, k, dt) => a + wrapAngle(b - a) * (1 - Math.exp(-k * dt));
export const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
