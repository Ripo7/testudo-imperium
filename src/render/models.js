import { THREE } from '../three.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { smooth } from '../core/util.js';

/* =========================================================
   Close-up unit models
   Made in Blender (tools/blender/units.py) and drawn instead of the light procedural soldiers when the camera is
   close (crowds.js). A file holds one mesh in Blender metres, feet at 0, facing forward (+z here), one plain colour
   per material; the material `tint` takes the power's colour, `_part` marks the legs (1, 2), the weapon arm (3) and
   a siege engine's throwing arm (4), `_wave` the cloth. A missing or broken file only means that unit keeps its light model up close.
   ========================================================= */
export const MODEL_SCALE = 0.2;                // Blender metres to game units
export const MODEL_URLS = {
  spear: new URL('../assets/units/spear.glb', import.meta.url).href,
  arch: new URL('../assets/units/arch.glb', import.meta.url).href,
  cav: new URL('../assets/units/cav.glb', import.meta.url).href,
  siege: new URL('../assets/units/siege.glb', import.meta.url).href,
  leg: new URL('../assets/units/leg.glb', import.meta.url).href,
  legT: new URL('../assets/units/legT.glb', import.meta.url).href,
  char: new URL('../assets/units/char.glb', import.meta.url).href,
};
export const MODELS = {};                      // unit type -> geometry for the crowd material, once loaded

/** One indexed geometry with the crowd shader's attributes (colour, aTint, aPart, aWave) from a loaded glTF scene. */
export function modelGeometry(root) {
  root.updateMatrixWorld(true);
  const meshes = [];
  root.traverse((o) => { if (o.isMesh) meshes.push(o); });
  const prepared = [];
  let nv = 0, ni = 0;
  for (const m of meshes) {
    const g = m.geometry.clone();
    g.applyMatrix4(m.matrixWorld);
    g.scale(MODEL_SCALE, MODEL_SCALE, MODEL_SCALE);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]);
    prepared.push([g, m.material]);
    nv += g.attributes.position.count; ni += g.index.count;
  }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3);
  const tint = new Float32Array(nv), part = new Float32Array(nv), wave = new Float32Array(nv);
  const idx = new Uint32Array(ni);
  let o = 0, oi = 0;
  for (const [g, mat] of prepared) {
    const n = g.attributes.position.count, P = g.attributes.position, gp = g.attributes._part, gw = g.attributes._wave;
    const c = mat.color || new THREE.Color(1, 1, 1), t = mat.name === 'tint' ? 1 : 0;
    const N = g.attributes.normal;
    for (let i = 0; i < n; i++) {
      const k = (o + i) * 3, y = P.getY(i);
      pos[k] = P.getX(i); pos[k + 1] = y; pos[k + 2] = P.getZ(i);
      nor[k] = N.getX(i); nor[k + 1] = N.getY(i); nor[k + 2] = N.getZ(i);
      const f = 0.72 + 0.36 * smooth(0, 0.42, y);      // painted light, as the procedural soldiers: darker toward the feet
      col[k] = c.r * f; col[k + 1] = c.g * f; col[k + 2] = c.b * f;
      tint[o + i] = t;
      part[o + i] = gp ? Math.round(gp.getX(i)) : 0;
      wave[o + i] = gw ? gw.getX(i) : 0;
    }
    for (let i = 0; i < g.index.count; i++) idx[oi + i] = g.index.getX(i) + o;
    o += n; oi += g.index.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setAttribute('aTint', new THREE.BufferAttribute(tint, 1));
  out.setAttribute('aPart', new THREE.BufferAttribute(part, 1));
  out.setAttribute('aWave', new THREE.BufferAttribute(wave, 1));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

/** Load every close-up model in the background; onReady(type, geometry) for each that arrives. */
export function loadUnitModels(onReady) {
  const loader = new GLTFLoader();
  for (const [type, url] of Object.entries(MODEL_URLS)) {
    loader.load(url, (gltf) => {
      MODELS[type] = modelGeometry(gltf.scene);
      onReady(type, MODELS[type]);
    }, undefined, (e) => console.warn(`close-up model for ${type} not loaded:`, e && e.message ? e.message : e));
  }
}
