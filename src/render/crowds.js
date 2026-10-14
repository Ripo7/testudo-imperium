import { THREE } from '../three.js';
import { seesArmy } from '../ui/view.js';
import { GS } from '../game/state.js';
import { clamp, isTouch, smooth, TAU } from '../core/util.js';
import { rng32 } from '../map/generate.js';
import { _ge, _gm, _gp, _gq, _gs, box, cone, cyl, MAT, scene, sph } from './renderer.js';
import { cellToWorld, FCOL } from './world.js';
import { dust } from './overlays.js';
import { CAM } from './camera.js';
import { sigOf } from '../game/data.js';

/* =========================================================
   Armies: chunky painted soldiers (instanced), standards,
   testudo formation, marching legs, battle effects.
   ========================================================= */
export const CROWD_TYPES = ['spear', 'leg', 'legT', 'arch', 'cav', 'siege', 'std', 'ele', 'gae', 'char'];
export const CROWD_CAP = { spear: 3000, leg: 2400, legT: 2400, arch: 2400, cav: 1600, siege: 300, std: 400, ele: 500, gae: 2400, char: 800 };
export const crowd = {};
export const ARMY_U = { uTime: { value: 0 } };
MAT.crowd = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.08, envMapIntensity: 0.8 });
MAT.crowd.onBeforeCompile = (sh) => {
  sh.uniforms.uTime = ARMY_U.uTime;
  sh.vertexShader = 'attribute float aTint;\nattribute float aPart;\nattribute float aWave;\nattribute vec3 iAnim;\nuniform float uTime;\n' + sh.vertexShader
    .replace('#include <color_vertex>', [
      'vColor = vec3(1.0);',
      '#ifdef USE_COLOR', 'vColor *= color;', '#endif',
      '#ifdef USE_INSTANCING_COLOR', 'vColor.xyz = mix(vColor.xyz, vColor.xyz * instanceColor.xyz, aTint);', '#endif',
    ].join('\n'))
    .replace('#include <begin_vertex>', [
      '#include <begin_vertex>',
      '{',
      '  float ph = iAnim.x, walk = iAnim.y, fight = iAnim.z;',
      '  float sw = sin(uTime * 10.0 + ph);',
      '  float foot = clamp((0.13 - position.y) / 0.13, 0.0, 1.0);',
      '  if (aPart > 0.5 && aPart < 1.5) transformed.z += sw * 0.05 * walk * foot;',
      '  else if (aPart > 1.5 && aPart < 2.5) transformed.z -= sw * 0.05 * walk * foot;',
      '  else if (aPart > 2.5 && aPart < 3.5) { float th = max(0.0, sin(uTime * 7.5 + ph)); transformed.z += th * 0.07 * fight; transformed.y += th * 0.015 * fight; }',
      '  else if (aPart > 3.5) { float k = clamp((position.y - 0.1) / 0.3, 0.0, 1.0); float th = max(0.0, sin(uTime * 2.2 + ph)); transformed.z -= th * k * 0.16 * fight; transformed.y -= th * k * 0.05 * fight; }',
      '  transformed.z += sin(uTime * 6.5 + position.x * 30.0 + position.y * 10.0 + ph) * 0.028 * aWave;',
      '  transformed.x += sin(uTime * 4.1 + position.y * 15.0 + ph) * 0.008 * aWave;',
      '}',
    ].join('\n'));
};
MAT.crowd.customProgramCacheKey = () => 'crowd-anim';

/* ---------- geometry ---------- */
// parts: { geo, color, pos, rot, scale, tint, part (1 left leg, 2 right leg, 3 weapon arm, 4 siege arm), wave }
export function mergeX(parts) {
  const prepared = []; let total = 0;
  for (const p of parts) {
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
    if (!g.attributes.normal) g.computeVertexNormals();
    const r = p.rot || [0, 0, 0], ps = p.pos || [0, 0, 0], sc = p.scale || [1, 1, 1];
    _ge.set(r[0], r[1], r[2]); _gq.setFromEuler(_ge);
    _gm.compose(_gp.set(ps[0], ps[1], ps[2]), _gq, _gs.set(sc[0], sc[1], sc[2]));
    g.applyMatrix4(_gm);
    prepared.push([g, new THREE.Color(p.color), p.tint ? 1 : 0, p.part || 0, p.wave || 0]);
    total += g.attributes.position.count;
  }
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3);
  const tint = new Float32Array(total), part = new Float32Array(total), wave = new Float32Array(total);
  let o = 0;
  for (const [g, c, t, pt, wv] of prepared) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
    for (let i = 0; i < n; i++) {
      const k = (o + i) * 3, y = g.attributes.position.getY(i);
      const f = 0.72 + 0.36 * smooth(0, 0.42, y);      // painted light: darker toward the feet
      col[k] = c.r * f; col[k + 1] = c.g * f; col[k + 2] = c.b * f;
      tint[o + i] = t; part[o + i] = pt; wave[o + i] = wv ? clamp(wv === true ? 1 : wv, 0, 1) : 0;
    }
    o += n; g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setAttribute('aTint', new THREE.BufferAttribute(tint, 1));
  out.setAttribute('aPart', new THREE.BufferAttribute(part, 1));
  out.setAttribute('aWave', new THREE.BufferAttribute(wave, 1));
  out.computeBoundingSphere();
  return out;
}
// a cloth whose wave weight grows away from the pole (x = 0)
export function clothGeo(w, h, segs) {
  const g = new THREE.BoxGeometry(w, h, 0.008, segs || 4, 2, 1).translate(w / 2, -h / 2, 0).toNonIndexed();
  return g;
}
export function buildCrowdGeos() {
  const SKIN = '#e9c9a6', STEEL = '#aeb6bf', DARK = '#3d3128', LEATHER = '#6b4f37', WOOD = '#7a5434', GOLD = '#d9b04a', W = '#ffffff';
  const legs = (h, sp) => [
    { geo: box(0.032, h, 0.034), color: LEATHER, pos: [-sp, h / 2, 0], part: 1 },
    { geo: box(0.032, h, 0.034), color: LEATHER, pos: [sp, h / 2, 0], part: 2 },
  ];
  const head = (y) => ({ geo: sph(0.046, 7, 5), color: SKIN, pos: [0, y, 0.004] });
  const helm = (y, col) => ({ geo: new THREE.SphereGeometry(0.051, 8, 5, 0, TAU, 0, Math.PI * 0.55), color: col || STEEL, pos: [0, y, 0] });
  const torso = (y, tint) => ({ geo: new THREE.CylinderGeometry(0.048, 0.06, 0.13, 8), color: W, tint: tint === undefined ? 1 : tint, pos: [0, y, 0] });
  const G = {};
  // legionary: curved scutum in faction colour, crested helmet, pilum
  const scutum = (pos, rot) => ({ geo: new THREE.CylinderGeometry(0.15, 0.15, 0.18, 8, 1, true, -0.45, 0.9), color: W, tint: 1, pos, rot: rot || [0, 0, 0] });
  const legBase = [
    ...legs(0.1, 0.024),
    { geo: new THREE.CylinderGeometry(0.06, 0.068, 0.05, 8), color: W, tint: 1, pos: [0, 0.11, 0] },        // tunic skirt
    { geo: new THREE.CylinderGeometry(0.05, 0.058, 0.1, 8), color: '#9aa2ab', pos: [0, 0.18, 0] },           // lorica
    head(0.275), helm(0.282),
    { geo: box(0.014, 0.04, 0.085), color: W, tint: 1, pos: [0, 0.335, -0.005] },                             // crest
  ];
  G.leg = mergeX([...legBase,
    scutum([0, 0.17, -0.07]), { geo: sph(0.018, 6, 4), color: GOLD, pos: [0, 0.17, 0.085] },
    { geo: box(0.11, 0.008, 0.006), color: GOLD, pos: [0, 0.245, 0.077] }, { geo: box(0.11, 0.008, 0.006), color: GOLD, pos: [0, 0.095, 0.077] },
    { geo: cyl(0.006, 0.006, 0.46, 4), color: WOOD, pos: [0.075, 0.26, 0.02], part: 3 },
    { geo: cone(0.011, 0.07, 4), color: STEEL, pos: [0.075, 0.52, 0.02], part: 3 },
  ]);
  // testudo: shield held overhead, roofing the formation
  G.legT = mergeX([...legBase,
    Object.assign(scutum([0, 0.225, 0], [-Math.PI / 2, 0, 0]), { scale: [1.2, 1, 1.15] }),
    scutum([0, 0.16, -0.07]),
  ]);
  // spearman: round shield, conical helmet, long spear
  G.spear = mergeX([
    ...legs(0.1, 0.024), torso(0.165), head(0.27),
    { geo: cone(0.052, 0.07, 8), color: '#8f969d', pos: [0, 0.315, 0] },
    { geo: cyl(0.075, 0.075, 0.014, 12), color: W, tint: 1, rot: [Math.PI / 2, 0, 0], pos: [-0.04, 0.17, 0.065] },
    { geo: new THREE.TorusGeometry(0.075, 0.008, 4, 14), color: '#c8b27a', pos: [-0.04, 0.17, 0.074] },
    { geo: cyl(0.007, 0.007, 0.62, 4), color: WOOD, pos: [0.07, 0.3, 0.03], part: 3 },
    { geo: cone(0.016, 0.065, 4), color: STEEL, pos: [0.07, 0.64, 0.03], part: 3 },
  ]);
  // archer: hood, bow, quiver
  G.arch = mergeX([
    ...legs(0.1, 0.024), torso(0.165), head(0.27),
    { geo: new THREE.SphereGeometry(0.052, 8, 5, 0, TAU, 0, Math.PI * 0.6), color: W, tint: 1, pos: [0, 0.278, -0.004] },
    { geo: new THREE.TorusGeometry(0.13, 0.007, 4, 12, 2.3), color: '#5a3a22', rot: [0, Math.PI / 2, -1.15], pos: [-0.06, 0.2, 0.07], part: 3 },
    { geo: cyl(0.022, 0.022, 0.15, 6), color: LEATHER, pos: [0.03, 0.21, -0.06], rot: [0.35, 0, 0.2] },
    { geo: cyl(0.003, 0.003, 0.05, 3), color: '#e8e0d0', pos: [0.04, 0.3, -0.09], rot: [0.35, 0, 0.2] },
  ]);
  // cavalry: horse + rider with lance and small shield
  G.cav = mergeX([
    { geo: new THREE.CapsuleGeometry(0.05, 0.15, 4, 8), color: '#7a5537', pos: [0, 0.17, 0], rot: [Math.PI / 2, 0, 0] },
    { geo: box(0.05, 0.12, 0.06), color: '#704d32', pos: [0, 0.24, 0.12], rot: [-0.55, 0, 0] },
    { geo: box(0.044, 0.05, 0.1), color: '#704d32', pos: [0, 0.29, 0.17], rot: [0.2, 0, 0] },
    { geo: box(0.012, 0.06, 0.07), color: DARK, pos: [0, 0.29, 0.1], rot: [-0.5, 0, 0] },
    { geo: cone(0.022, 0.12, 5), color: DARK, pos: [0, 0.17, -0.13], rot: [-2.3, 0, 0] },
    { geo: box(0.026, 0.13, 0.028), color: '#5a3d26', pos: [-0.032, 0.065, 0.085], part: 1 },
    { geo: box(0.026, 0.13, 0.028), color: '#5a3d26', pos: [0.032, 0.065, 0.085], part: 2 },
    { geo: box(0.026, 0.13, 0.028), color: '#5a3d26', pos: [-0.032, 0.065, -0.085], part: 2 },
    { geo: box(0.026, 0.13, 0.028), color: '#5a3d26', pos: [0.032, 0.065, -0.085], part: 1 },
    { geo: box(0.115, 0.03, 0.14), color: W, tint: 1, pos: [0, 0.215, -0.01] },                                // saddle cloth
    { geo: new THREE.CylinderGeometry(0.04, 0.05, 0.11, 8), color: W, tint: 1, pos: [0, 0.29, -0.02] },
    head(0.37), helm(0.376),
    { geo: box(0.012, 0.035, 0.07), color: W, tint: 1, pos: [0, 0.425, -0.02] },
    { geo: cyl(0.055, 0.055, 0.012, 10), color: W, tint: 1, rot: [0, 0, Math.PI / 2], pos: [-0.055, 0.28, -0.01] },
    { geo: cyl(0.006, 0.006, 0.55, 4), color: WOOD, pos: [0.06, 0.38, 0.08], rot: [0.75, 0, 0], part: 3 },
    { geo: cone(0.012, 0.05, 4), color: STEEL, pos: [0.06, 0.58, 0.28], rot: [0.75, 0, 0], part: 3 },
  ]);
  // siege engine (onager) with a throwing arm and a small pennant
  G.siege = mergeX([
    { geo: box(0.2, 0.04, 0.4), color: WOOD, pos: [0, 0.07, 0] },
    ...[[-0.12, -0.14], [0.12, -0.14], [-0.12, 0.14], [0.12, 0.14]].map(([x, z]) => ({ geo: cyl(0.055, 0.055, 0.03, 10), color: '#4a3220', rot: [0, 0, Math.PI / 2], pos: [x, 0.055, z] })),
    { geo: box(0.03, 0.18, 0.03), color: '#6a4a2c', pos: [-0.08, 0.17, 0.05] },
    { geo: box(0.03, 0.18, 0.03), color: '#6a4a2c', pos: [0.08, 0.17, 0.05] },
    { geo: box(0.19, 0.03, 0.04), color: '#6a4a2c', pos: [0, 0.26, 0.05] },
    { geo: cyl(0.03, 0.03, 0.15, 8), color: '#c9b48a', rot: [0, 0, Math.PI / 2], pos: [0, 0.1, -0.08] },
    { geo: box(0.025, 0.03, 0.34), color: '#7c5634', pos: [0, 0.17, -0.0], rot: [0.95, 0, 0], part: 4 },
    { geo: sph(0.035, 6, 4), color: '#8c8478', pos: [0, 0.3, -0.12], part: 4 },
    { geo: cyl(0.005, 0.005, 0.3, 4), color: WOOD, pos: [0.09, 0.22, -0.18] },
    { geo: clothGeo(0.1, 0.06, 3), color: W, tint: 1, pos: [0.09, 0.37, -0.18], wave: 1 },
  ]);
  // standard bearer: the army's vexillum, with a golden eagle for Rome-like flair
  G.std = mergeX([
    ...legs(0.1, 0.024),
    { geo: new THREE.CylinderGeometry(0.06, 0.068, 0.05, 8), color: W, tint: 1, pos: [0, 0.11, 0] },
    { geo: new THREE.CylinderGeometry(0.05, 0.058, 0.1, 8), color: '#9aa2ab', pos: [0, 0.18, 0] },
    head(0.275), { geo: new THREE.SphereGeometry(0.055, 8, 5, 0, TAU, 0, Math.PI * 0.55), color: '#6b4a2e', pos: [0, 0.29, -0.005] },  // animal-skin hood
    { geo: cyl(0.009, 0.009, 0.84, 5), color: WOOD, pos: [0.06, 0.42, 0.02] },
    { geo: box(0.2, 0.012, 0.012), color: GOLD, pos: [0.06, 0.72, 0.02] },
    { geo: clothGeo(0.2, 0.17, 5), color: W, tint: 1, pos: [-0.04, 0.715, 0.02], wave: 0.5 },
    { geo: box(0.012, 0.03, 0.012), color: GOLD, pos: [-0.04, 0.535, 0.02] }, { geo: box(0.012, 0.03, 0.012), color: GOLD, pos: [0.16, 0.535, 0.02] },
    { geo: sph(0.03, 6, 4), color: GOLD, pos: [0.06, 0.88, 0.02], scale: [1.6, 0.8, 0.8] },
    { geo: cone(0.02, 0.05, 4), color: GOLD, pos: [0.06, 0.92, 0.02] },
  ]);
  // horse, reused by the chariot team (cavalry builds its own above)
  const horse = (ox, oz, s) => [
    [new THREE.CapsuleGeometry(0.05, 0.15, 4, 8), '#7a5537', [0, 0.17, 0], [Math.PI / 2, 0, 0]],
    [box(0.05, 0.12, 0.06), '#704d32', [0, 0.24, 0.12], [-0.55, 0, 0]],
    [box(0.044, 0.05, 0.1), '#704d32', [0, 0.29, 0.17], [0.2, 0, 0]],
    [box(0.012, 0.06, 0.07), DARK, [0, 0.29, 0.1], [-0.5, 0, 0]],
    [cone(0.022, 0.12, 5), DARK, [0, 0.17, -0.13], [-2.3, 0, 0]],
    [box(0.026, 0.13, 0.028), '#5a3d26', [-0.032, 0.065, 0.085], null, 1],
    [box(0.026, 0.13, 0.028), '#5a3d26', [0.032, 0.065, 0.085], null, 2],
    [box(0.026, 0.13, 0.028), '#5a3d26', [-0.032, 0.065, -0.085], null, 2],
    [box(0.026, 0.13, 0.028), '#5a3d26', [0.032, 0.065, -0.085], null, 1],
    [box(0.07, 0.012, 0.09), W, [0, 0.225, 0.02], null, 0, 1],                                                    // caparison in faction colour
  ].map(([geo, color, p, rot, part, tint]) => ({ geo, color, pos: [ox + p[0] * s, p[1] * s, oz + p[2] * s], rot: rot || [0, 0, 0], scale: [s, s, s], part: part || 0, tint: tint || 0 }));
  // war elephant (Carthage): towered howdah in faction colour, mahout on the neck, tusks, swinging trunk
  const ELE = '#9a948d', ELE_D = '#7c766f', IVORY = '#f1e8d4';
  G.ele = mergeX([
    { geo: new THREE.CapsuleGeometry(0.105, 0.17, 4, 10), color: ELE, pos: [0, 0.27, -0.02], rot: [Math.PI / 2, 0, 0] },
    { geo: cyl(0.04, 0.046, 0.19, 8), color: ELE_D, pos: [-0.062, 0.095, 0.1], part: 1 },
    { geo: cyl(0.04, 0.046, 0.19, 8), color: ELE_D, pos: [0.062, 0.095, 0.1], part: 2 },
    { geo: cyl(0.04, 0.046, 0.19, 8), color: ELE_D, pos: [-0.062, 0.095, -0.13], part: 2 },
    { geo: cyl(0.04, 0.046, 0.19, 8), color: ELE_D, pos: [0.062, 0.095, -0.13], part: 1 },
    { geo: sph(0.082, 10, 8), color: ELE, pos: [0, 0.34, 0.19] },
    { geo: cyl(0.07, 0.07, 0.012, 12), color: ELE_D, rot: [0, 0, Math.PI / 2], scale: [1, 1, 1.25], pos: [-0.082, 0.33, 0.16] },
    { geo: cyl(0.07, 0.07, 0.012, 12), color: ELE_D, rot: [0, 0, Math.PI / 2], scale: [1, 1, 1.25], pos: [0.082, 0.33, 0.16] },
    { geo: cyl(0.024, 0.034, 0.15, 7), color: ELE, pos: [0, 0.26, 0.27], rot: [0.35, 0, 0], part: 3 },
    { geo: cyl(0.015, 0.024, 0.11, 7), color: ELE, pos: [0, 0.155, 0.3], rot: [-0.2, 0, 0], part: 3 },
    { geo: cone(0.013, 0.12, 6), color: IVORY, pos: [-0.042, 0.26, 0.29], rot: [1.95, 0, 0] },
    { geo: cone(0.013, 0.12, 6), color: IVORY, pos: [0.042, 0.26, 0.29], rot: [1.95, 0, 0] },
    { geo: cyl(0.006, 0.01, 0.12, 4), color: ELE_D, pos: [0, 0.24, -0.2], rot: [-0.4, 0, 0] },
    { geo: box(0.232, 0.12, 0.2), color: W, tint: 1, pos: [0, 0.31, -0.03] },                                     // draped blanket
    { geo: box(0.16, 0.085, 0.17), color: '#8a6440', pos: [0, 0.425, -0.04] },                                    // howdah
    { geo: box(0.172, 0.022, 0.182), color: W, tint: 1, pos: [0, 0.475, -0.04] },
    ...[[-0.06, -0.1], [0.06, -0.1], [-0.06, 0.02], [0.06, 0.02]].map(([x, z]) => ({ geo: box(0.03, 0.03, 0.03), color: '#6b4a2e', pos: [x, 0.5, z] })),
    { geo: new THREE.CylinderGeometry(0.035, 0.042, 0.08, 7), color: W, tint: 1, pos: [0, 0.53, -0.04] },          // soldier in the tower
    head(0.6), helm(0.606),
    { geo: cyl(0.006, 0.006, 0.42, 4), color: WOOD, pos: [0.06, 0.66, -0.04], part: 3 },
    { geo: cone(0.012, 0.06, 4), color: STEEL, pos: [0.06, 0.9, -0.04], part: 3 },
    { geo: new THREE.CylinderGeometry(0.03, 0.036, 0.07, 7), color: '#d8c9a8', pos: [0, 0.43, 0.13] },            // mahout
    { geo: sph(0.034, 7, 5), color: SKIN, pos: [0, 0.49, 0.135] },
  ]);
  // Gaesatae (Gaul): bare-chested, lime-spiked hair, gold torc, long oval shield, sword
  G.gae = mergeX([
    { geo: box(0.032, 0.1, 0.034), color: '#7d6a8c', pos: [-0.024, 0.05, 0], part: 1 },                          // chequered trousers
    { geo: box(0.032, 0.1, 0.034), color: '#7d6a8c', pos: [0.024, 0.05, 0], part: 2 },
    { geo: new THREE.CylinderGeometry(0.058, 0.062, 0.035, 8), color: '#5d4630', pos: [0, 0.11, 0] },
    { geo: new THREE.CylinderGeometry(0.046, 0.056, 0.12, 8), color: SKIN, pos: [0, 0.18, 0] },
    { geo: new THREE.TorusGeometry(0.032, 0.007, 4, 10), color: GOLD, rot: [Math.PI / 2, 0, 0], pos: [0, 0.238, 0.005] },
    head(0.275),
    { geo: cone(0.05, 0.085, 7), color: '#ece0b8', pos: [0, 0.335, -0.008] },
    { geo: cyl(0.084, 0.084, 0.014, 14), color: W, tint: 1, rot: [Math.PI / 2, 0, 0], scale: [0.78, 1, 1.75], pos: [-0.05, 0.18, 0.066] },
    { geo: sph(0.02, 6, 4), color: GOLD, pos: [-0.05, 0.18, 0.078] },
    { geo: box(0.008, 0.14, 0.005), color: GOLD, pos: [-0.05, 0.18, 0.074] },
    { geo: box(0.014, 0.17, 0.006), color: STEEL, pos: [0.075, 0.33, 0.03], part: 3 },
    { geo: box(0.05, 0.012, 0.012), color: GOLD, pos: [0.075, 0.245, 0.03], part: 3 },
  ]);
  // chariot (Egypt): two-horse team, painted car, six-spoke wheels, driver and archer
  const wheel = (x) => [
    { geo: new THREE.TorusGeometry(0.072, 0.01, 4, 16), color: '#6b4a2e', rot: [0, Math.PI / 2, 0], pos: [x, 0.08, -0.15] },
    ...[0, 1, 2].map((k) => ({ geo: box(0.008, 0.14, 0.008), color: '#8a6440', rot: [k * Math.PI / 3, 0, 0], pos: [x, 0.08, -0.15] })),
  ];
  G.char = mergeX([
    ...horse(-0.05, 0.16, 0.82), ...horse(0.05, 0.16, 0.82),
    { geo: box(0.012, 0.012, 0.24), color: WOOD, pos: [0, 0.15, 0.02] },                                         // pole
    { geo: box(0.17, 0.05, 0.12), color: W, tint: 1, pos: [0, 0.135, -0.15] },                                   // car
    { geo: box(0.17, 0.08, 0.014), color: GOLD, pos: [0, 0.2, -0.09] },
    { geo: box(0.014, 0.08, 0.12), color: GOLD, pos: [-0.078, 0.2, -0.15] },
    { geo: box(0.014, 0.08, 0.12), color: GOLD, pos: [0.078, 0.2, -0.15] },
    ...wheel(-0.1), ...wheel(0.1),
    { geo: cyl(0.01, 0.01, 0.22, 5), color: '#5a3d26', rot: [0, 0, Math.PI / 2], pos: [0, 0.08, -0.15] },
    { geo: new THREE.CylinderGeometry(0.036, 0.044, 0.1, 7), color: '#efe6cf', pos: [0.035, 0.22, -0.13] },        // driver
    { geo: sph(0.036, 7, 5), color: SKIN, pos: [0.035, 0.3, -0.13] },
    { geo: new THREE.SphereGeometry(0.04, 7, 5, 0, TAU, 0, Math.PI * 0.55), color: '#2f3a8a', pos: [0.035, 0.305, -0.135] },
    { geo: new THREE.CylinderGeometry(0.036, 0.044, 0.1, 7), color: W, tint: 1, pos: [-0.035, 0.22, -0.17] },     // archer
    { geo: sph(0.036, 7, 5), color: SKIN, pos: [-0.035, 0.3, -0.17] },
    { geo: new THREE.SphereGeometry(0.04, 7, 5, 0, TAU, 0, Math.PI * 0.55), color: '#2f3a8a', pos: [-0.035, 0.305, -0.175] },
    { geo: new THREE.TorusGeometry(0.1, 0.006, 4, 12, 2.3), color: '#5a3a22', rot: [0, Math.PI / 2, -1.15], pos: [-0.08, 0.27, -0.12], part: 3 },
  ]);
  // the cloth's wave weight should grow away from the pole: adjust using x distance
  {
    const g = G.std, p = g.attributes.position, wv = g.attributes.aWave;
    for (let i = 0; i < p.count; i++) if (wv.getX(i) > 0) wv.setX(i, clamp((p.getY(i) < 0.72 ? (0.72 - p.getY(i)) / 0.17 : 0) * 0.9 + 0.1, 0, 1));
  }
  {
    const g = G.siege, p = g.attributes.position, wv = g.attributes.aWave;
    for (let i = 0; i < p.count; i++) if (wv.getX(i) > 0) wv.setX(i, clamp((p.getX(i) - 0.09) / 0.1, 0, 1));
  }
  for (const t of CROWD_TYPES) {
    const geo = G[t];
    geo.setAttribute('iAnim', new THREE.InstancedBufferAttribute(new Float32Array(CROWD_CAP[t] * 3), 3));
    const m = new THREE.InstancedMesh(geo, MAT.crowd, CROWD_CAP[t]);
    m.count = 0; m.frustumCulled = false; m.castShadow = !isTouch;
    m.setColorAt(0, new THREE.Color(1, 1, 1));
    scene.add(m);
    crowd[t] = m;
  }
}

/* ---------- formation ---------- */
export const FIG_MEN = 25, FIG_MAX = 72;
export function armyLayout(a) {
  const c = a.comp;
  const men = c.spear + c.leg + c.arch + c.cav;
  const F = clamp(Math.round(men / FIG_MEN), men > 0 ? 2 : 0, FIG_MAX);
  const alloc = {};
  const types = ['spear', 'leg', 'arch', 'cav'].filter((t) => c[t] > 0);
  types.forEach((t) => { alloc[t] = men ? Math.max(1, Math.round(F * c[t] / men)) : 0; });
  let sum = types.reduce((s, t) => s + alloc[t], 0);
  while (sum > Math.max(F, types.length)) { const t = types.reduce((m, x) => (alloc[x] > alloc[m] ? x : m), types[0]); alloc[t]--; sum--; }
  alloc.siege = Math.min(6, Math.ceil(c.siege));
  // the elite unit: elephants and chariots are big, so fewer figures stand for the same men
  const sigT = sigOf(a.owner).key;
  if (alloc.leg && (sigT === 'ele' || sigT === 'char')) alloc.leg = Math.max(1, Math.round(alloc.leg * (sigT === 'ele' ? 0.4 : 0.55)));
  const nStd = men <= 0 ? 0 : men >= 3000 ? 3 : men >= 1400 ? 2 : 1;
  const tight = a.stance === 'def';
  const key = CROWD_TYPES.map((t) => alloc[t] || 0).join(',') + (tight ? 'T' : '') + nStd;
  if (a.layoutKey === key) return a.layout;
  a.layoutKey = key;
  const L = [];
  const rnd = rng32(a.id * 97 + 3);
  const SP = 0.2;
  const inf = (alloc.spear || 0) + (sigT === 'leg' || sigT === 'gae' ? alloc.leg || 0 : 0);
  const cols = clamp(Math.ceil(Math.sqrt(Math.max(1, inf + (alloc.arch || 0)) * 1.6)), 3, 12);
  const placeRows = (t, n, z0, sp) => {
    let k = 0, r = 0;
    const jit = sp < SP ? 0.012 : 0.05;
    while (k < n) {
      const inRow = Math.min(cols, n - k);
      for (let i = 0; i < inRow; i++, k++) L.push({ t, x: (i - (inRow - 1) / 2) * sp + (rnd() - 0.5) * jit + (r % 2) * sp * (sp < SP ? 0 : 0.3), z: z0 - r * sp + (rnd() - 0.5) * jit, ph: rnd() * TAU });
      r++;
    }
    return r;
  };
  let z = 0;
  // the elite unit leads: legionaries (a tight shield wall in testudo) or Gaesatae in front, elephants in a line ahead;
  // then spearmen, archers behind, cavalry and chariots on the wings, siege at the back
  if (alloc.leg && sigT === 'ele') {
    const per = Math.max(2, Math.ceil(cols * SP / 0.46));
    for (let k = 0; k < alloc.leg; k++) { const r = Math.floor(k / per), inRow = Math.min(per, alloc.leg - r * per), i = k - r * per; L.push({ t: 'ele', x: (i - (inRow - 1) / 2) * 0.46 + (rnd() - 0.5) * 0.04, z: 0.42 - r * 0.5, ph: rnd() * TAU }); }
  }
  if (alloc.leg && (sigT === 'leg' || sigT === 'gae')) { const sp = tight && sigT === 'leg' ? 0.15 : SP; const r = placeRows(sigT, alloc.leg, z, sp); z -= r * sp; }
  if (alloc.spear) { const r = placeRows('spear', alloc.spear, z, SP); z -= r * SP; }
  if (alloc.arch) { const r = placeRows('arch', alloc.arch, z - 0.06, SP); z -= r * SP + 0.06; }
  const depth = z;
  const half = cols / 2 * SP + 0.25;
  if (alloc.cav) {
    for (let k = 0; k < alloc.cav; k++) {
      const side = k % 2 ? 1 : -1, j = Math.floor(k / 2);
      const cc = j % 2, rr = Math.floor(j / 2);
      L.push({ t: 'cav', x: side * (half + cc * 0.24), z: -rr * 0.3, ph: rnd() * TAU });
    }
  }
  if (alloc.leg && sigT === 'char') {
    const off = half + (alloc.cav ? 0.55 : 0.1);
    for (let k = 0; k < alloc.leg; k++) {
      const side = k % 2 ? -1 : 1, j = Math.floor(k / 2);
      L.push({ t: 'char', x: side * (off + (j % 2) * 0.3), z: 0.1 - Math.floor(j / 2) * 0.48, ph: rnd() * TAU });
    }
  }
  for (let k = 0; k < (alloc.siege || 0); k++) L.push({ t: 'siege', x: (k - ((alloc.siege || 0) - 1) / 2) * 0.42, z: depth - 0.35, ph: rnd() * TAU });
  // standards just behind the front rank
  for (let k = 0; k < nStd; k++) L.push({ t: 'std', x: (k - (nStd - 1) / 2) * Math.max(0.5, cols * SP / (nStd + 0.5)), z: -0.12, ph: rnd() * TAU, std: true });
  let mz = 0, z0 = 0, z1 = 0; for (const f of L) { mz += f.z; z0 = Math.min(z0, f.z); z1 = Math.max(z1, f.z); } mz /= Math.max(1, L.length);
  for (const f of L) f.z -= mz;
  a.layout = L; a.layoutDepth = z1 - z0;
  return L;
}

/* ---------- per-frame placement ---------- */
export const _cm = new THREE.Matrix4(), _cq = new THREE.Quaternion(), _cs = new THREE.Vector3(1, 1, 1), _cp = new THREE.Vector3(), _cy = new THREE.Vector3(0, 1, 0);
export let crowdLastT = 0;
export function updateCrowds(t) {
  ARMY_U.uTime.value = t;
  const dt = clamp(t - crowdLastT, 0, 0.1); crowdLastT = t;
  const used = {}; for (const k of CROWD_TYPES) used[k] = 0;
  for (const a of GS.armies) {
    if (a.dead || !seesArmy(a)) continue;
    const L = armyLayout(a);
    const col = FCOL[a.owner];
    const moving = a.state === 'move' || a.state === 'rout';
    const fighting = a.state === 'battle';
    // in a field battle the two sides are drawn as facing lines instead of overlapping blobs
    let ax = a.x, ay = a.y, h = a.heading;
    const B = a.battle;
    if (fighting && B && !B.done && B.kind === 'field') {
      const si = B.sides[0].armies.includes(a) ? 0 : 1;
      if (!B.axis) {
        const c0 = sideCenter(B.sides[0], B), c1 = sideCenter(B.sides[1], B);
        let ux = c0[0] - c1[0], uy = c0[1] - c1[1], l = Math.hypot(ux, uy);
        if (l < 0.05) { const r = rng32(B.id * 31)() * TAU; ux = Math.cos(r); uy = Math.sin(r); l = 1; }
        B.axis = [ux / l, uy / l];
      }
      const [ux, uy] = B.axis, sg = si === 0 ? 1 : -1;
      const list = B.sides[si].armies, idx = list.indexOf(a), n = list.length;
      const want = 0.32 + (a.layoutDepth || 0.6) / 2;
      const lat = (idx - (n - 1) / 2) * 1.3;
      ax = B.x + ux * sg * want - uy * lat; ay = B.y + uy * sg * want + ux * lat;
      h = Math.atan2(-ux * sg, -uy * sg);
    }
    const ch = Math.cos(h), sh = Math.sin(h);
    const routing = a.state === 'rout';
    const testudo = a.stance === 'def';
    for (const f of L) {
      const type = f.t === 'leg' && testudo ? 'legT' : f.t;
      const m = crowd[type];
      const k = used[type]; if (k >= CROWD_CAP[type]) continue;
      used[type]++;
      let lx = f.x, lz = f.z;
      if (routing) { lx *= 1.7; lz *= 1.7; lx += Math.sin(t * 3 + f.ph) * 0.08; }
      if (fighting && f.t !== 'siege' && f.t !== 'std') { lz += Math.max(0, Math.sin(t * 7 + f.ph)) * 0.05; lx += Math.sin(t * 5.3 + f.ph * 2) * 0.02; }
      const px = ax + lx * ch + lz * sh;
      const py = ay - lx * sh + lz * ch;
      cellToWorld(px, py, _cp);
      if (_cp.y < 0.02) _cp.y = 0.02;
      const bob = moving ? Math.abs(Math.sin(t * (routing ? 14 : (f.t === 'cav' || f.t === 'char' ? 12 : f.t === 'ele' ? 6 : 10)) + f.ph)) * (f.t === 'cav' || f.t === 'char' ? 0.035 : f.t === 'ele' ? 0.012 : 0.02) : 0;
      _cp.y += bob;
      _cq.setFromAxisAngle(_cy, h + (fighting && f.t !== 'siege' ? Math.sin(t * 4 + f.ph) * 0.2 : 0) + (routing ? Math.PI : 0));
      _cm.compose(_cp, _cq, _cs);
      m.setMatrixAt(k, _cm);
      m.setColorAt(k, col);
      const an = m.geometry.attributes.iAnim;
      an.setXYZ(k, f.ph, moving ? (routing ? 1.4 : 1) : 0, fighting ? 1 : 0);
    }
    // dust under marching columns (only when it can be seen)
    if (moving && CAM.d < 70 && Math.random() < dt * (a.comp.cav > 0 || (a.comp.leg > 0 && sigOf(a.owner).beast) ? 3 : 1.2)) {
      const w = cellToWorld(ax - sh * 0.6, ay - ch * 0.6);
      dust(w.x, Math.max(0, w.y), w.z, 1, 0.5, 1.4, 0xd8c39a);
    }
  }
  for (const t2 of CROWD_TYPES) {
    const m = crowd[t2];
    m.count = used[t2];
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.geometry.attributes.iAnim.needsUpdate = true;
  }
  updateBattleFX(t, dt);
}

/* ---------- battle effects: arrow volleys, clash sparks, ground marker ---------- */
export const ARROW_CAP = 360;
export let arrows = null;
export const arrowPool = [];
export const battleRings = new Map();
export const RING_GEO = new THREE.RingGeometry(0.82, 1.0, 48).rotateX(-Math.PI / 2);
export function ensureArrows() {
  if (arrows) return;
  const g = mergeX([
    { geo: box(0.008, 0.008, 0.16), color: '#5a3e26', pos: [0, 0, 0] },
    { geo: cone(0.012, 0.03, 4), color: '#d0d4d8', pos: [0, 0, 0.09], rot: [Math.PI / 2, 0, 0] },
    { geo: box(0.02, 0.003, 0.03), color: '#f0ece0', pos: [0, 0, -0.07] },
  ]);
  g.setAttribute('iAnim', new THREE.InstancedBufferAttribute(new Float32Array(ARROW_CAP * 3), 3));
  arrows = new THREE.InstancedMesh(g, MAT.crowd, ARROW_CAP);
  arrows.count = 0; arrows.frustumCulled = false;
  scene.add(arrows);
}
export const _ap = new THREE.Vector3(), _av = new THREE.Vector3(), _am = new THREE.Matrix4(), _aq = new THREE.Quaternion(), _az = new THREE.Vector3(0, 0, 1), _as = new THREE.Vector3(1.9, 1.9, 1.9);
export function sideCenter(s, B) {
  if (s.armies.length) { let x = 0, y = 0; for (const a of s.armies) { x += a.x; y += a.y; } return [x / s.armies.length, y / s.armies.length]; }
  return [B.x, B.y];
}
export function updateBattleFX(t, dt) {
  ensureArrows();
  const live = new Set();
  const paused = GS.speed <= 0;
  for (const B of GS.battles) {
    if (B.done) continue;
    live.add(B.id);
    // pulsing ground ring
    let R = battleRings.get(B.id);
    if (!R) {
      R = new THREE.Mesh(RING_GEO, new THREE.MeshBasicMaterial({ color: 0xff6a3a, transparent: true, opacity: 0.5, depthWrite: false, fog: false }));
      R.renderOrder = 4; scene.add(R); battleRings.set(B.id, R);
    }
    cellToWorld(B.x, B.y, R.position); R.position.y = Math.max(R.position.y, 0) + 0.06;
    const s = (B.kind === 'field' ? 1.5 : 2.1) * (1 + 0.06 * Math.sin(t * 4));
    R.scale.set(s, 1, s);
    R.material.opacity = 0.35 + 0.2 * Math.sin(t * 4);
    if (paused || CAM.d > 120) continue;
    // dust over the melee
    if (Math.random() < dt * 3) { const w = cellToWorld(B.x, B.y); dust(w.x, Math.max(0, w.y), w.z, 2, 0.9, 1.4); }
    // archers loose volleys at the other side
    for (let i = 0; i < 2; i++) {
      const S = B.sides[i], O = B.sides[1 - i];
      const shooters = sigOf(S.faction).shoot ? 1 : 0;   // chariots shoot too
      const archers = S.armies.reduce((m, a) => m + a.comp.arch + a.comp.leg * shooters, 0) + (S.militia ? S.militia.men * 0.15 : 0);
      if (archers < 20) continue;
      B.volley = B.volley || [0, 0];
      B.volley[i] -= dt;
      if (B.volley[i] > 0) continue;
      B.volley[i] = 1.1 + Math.random() * 0.6;
      const [sx, sy] = S.armies.length ? sideCenter(S, B) : [B.x, B.y];
      const [tx, ty] = sideCenter(O, B);
      const n = Math.min(14, 3 + Math.round(archers / 60));
      for (let k = 0; k < n; k++) {
        if (arrowPool.length >= ARROW_CAP) break;
        const from = cellToWorld(sx + (Math.random() - 0.5) * 0.8, sy + (Math.random() - 0.5) * 0.8);
        const to = cellToWorld(tx + (Math.random() - 0.5) * 1.0, ty + (Math.random() - 0.5) * 1.0);
        from.y = Math.max(from.y, 0) + 0.3; to.y = Math.max(to.y, 0) + 0.05;
        arrowPool.push({ from, to, t: -k * 0.04, dur: 0.75 + Math.random() * 0.2, arc: 0.9 + from.distanceTo(to) * 0.25 });
      }
    }
    // sparks where the lines meet
    if (Math.random() < dt * 4) {
      const w = cellToWorld(B.x + (Math.random() - 0.5) * 0.6, B.y + (Math.random() - 0.5) * 0.6);
      dust(w.x, Math.max(0, w.y) + 0.15, w.z, 1, 0.15, 0.35, 0xfff0b8);
    }
  }
  for (const [id, R] of battleRings) if (!live.has(id)) { scene.remove(R); R.material.dispose(); battleRings.delete(id); }
  // fly the arrows
  let n = 0;
  for (let i = arrowPool.length - 1; i >= 0; i--) {
    const A = arrowPool[i];
    if (!paused) A.t += dt;
    const u = A.t / A.dur;
    if (u >= 1) { arrowPool.splice(i, 1); continue; }
    if (u < 0) continue;
    _ap.lerpVectors(A.from, A.to, u); _ap.y += Math.sin(u * Math.PI) * A.arc;
    _av.subVectors(A.to, A.from); _av.y += Math.cos(u * Math.PI) * Math.PI * A.arc; _av.normalize();
    _aq.setFromUnitVectors(_az, _av);
    _am.compose(_ap, _aq, _as);
    arrows.setMatrixAt(n, _am); arrows.setColorAt(n, _white);
    n++;
  }
  arrows.count = n;
  arrows.instanceMatrix.needsUpdate = true; if (arrows.instanceColor) arrows.instanceColor.needsUpdate = true;
}
export const _white = new THREE.Color(1, 1, 1);
