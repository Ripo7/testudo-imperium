import { THREE } from '../three.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MODEL_GEOS } from './city/kit.js';

/* =========================================================
   Landmark models for the cities
   Made in Blender (tools/blender/landmarks.py): the Roman temple and amphitheatre, the Egyptian pylon and lighthouse,
   the Punic temple, the Gaulish chief's hall. Each file is one mesh in plain colours, its front toward Blender's -Y
   (+z here). The city builders place them, scaled to the ground they are given, wherever they find them loaded
   (kit.js `model`); until then, or without the files, they draw their procedural landmarks.
   ========================================================= */
export const LANDMARK_URLS = {
  roman_temple: new URL('../assets/landmarks/roman_temple.glb', import.meta.url).href,
  amphitheatre: new URL('../assets/landmarks/amphitheatre.glb', import.meta.url).href,
  pylon: new URL('../assets/landmarks/pylon.glb', import.meta.url).href,
  punic_temple: new URL('../assets/landmarks/punic_temple.glb', import.meta.url).href,
  gaul_hall: new URL('../assets/landmarks/gaul_hall.glb', import.meta.url).href,
  pharos: new URL('../assets/landmarks/pharos.glb', import.meta.url).href,
};

/** One indexed geometry with vertex colours from a loaded glTF scene, centred on its footprint and standing on y = 0. */
export function landmarkGeometry(root) {
  root.updateMatrixWorld(true);
  const parts = [];
  let nv = 0, ni = 0;
  root.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]);
    parts.push([g, o.material.color || new THREE.Color(1, 1, 1)]);
    nv += g.attributes.position.count; ni += g.index.count;
  });
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3), idx = new Uint32Array(ni);
  let o = 0, oi = 0;
  for (const [g, c] of parts) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    for (let i = 0; i < n; i++) { col[(o + i) * 3] = c.r; col[(o + i) * 3 + 1] = c.g; col[(o + i) * 3 + 2] = c.b; }
    for (let i = 0; i < g.index.count; i++) idx[oi + i] = g.index.getX(i) + o;
    o += n; oi += g.index.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingBox();
  const b = out.boundingBox;
  out.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
  out.computeBoundingBox();
  return out;
}

/** Load every landmark in the background; onAll() once they have all arrived (or failed). */
export function loadLandmarkModels(onAll) {
  const loader = new GLTFLoader(), keys = Object.keys(LANDMARK_URLS);
  let left = keys.length;
  const done = () => { if (--left === 0 && onAll) onAll(); };
  for (const key of keys) {
    loader.load(LANDMARK_URLS[key], (gltf) => {
      const geo = landmarkGeometry(gltf.scene), s = geo.boundingBox.getSize(new THREE.Vector3());
      MODEL_GEOS[key] = { geo, w: s.x, h: s.y, d: s.z };
      done();
    }, undefined, (e) => { console.warn(`landmark ${key} not loaded:`, e && e.message ? e.message : e); done(); });
  }
}
