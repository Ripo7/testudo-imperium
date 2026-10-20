// City lab (citylab.html): every culture at every size, built by the same generator as the game (src/render/citygen.js),
// on a flat board, for judging the cities without playing. Not part of the game itself.
import { THREE } from '../src/three.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CULTURES, cityGeometry, planCity, wallParts } from '../src/render/citygen.js';
import { merge } from '../src/render/geom.js';
import { loadLandmarkModels } from '../src/render/landmarkModels.js';
import { TAU } from '../src/core/util.js';

const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.86;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#e9dfca');
const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 400);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.maxPolarAngle = 1.45;

scene.add(new THREE.HemisphereLight('#fff6e4', '#8a7a5c', 0.75));
const sun = new THREE.DirectionalLight('#fff1d6', 2.1);
sun.position.set(-14, 22, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 80 });
sun.shadow.bias = -0.0005;
scene.add(sun);

// the board: rows are cultures, columns sizes
const SIZES = [
  { name: 'Village', major: false, capital: false, walls: 0 },
  { name: 'Walled town', major: false, capital: false, walls: 2 },
  { name: 'City', major: true, capital: false, walls: 1 },
  { name: 'Capital', major: true, capital: true, walls: 3 },
];
const GAP = 4.6;
const ground = new THREE.Mesh(new THREE.PlaneGeometry(GAP * SIZES.length + 4, GAP * CULTURES.length + 4), new THREE.MeshStandardMaterial({ color: '#b9a777', roughness: 1 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });
const WATER = new THREE.MeshStandardMaterial({ color: '#4f8fa8', roughness: 0.3, metalness: 0 });
const board = new THREE.Group();
scene.add(board);
const tags = [];
let seedBase = 1;

export function build() {
  for (const m of board.children) m.geometry.dispose();   // (the river's boxes too)
  board.clear();
  for (const t of tags) t.el.remove();
  tags.length = 0;
  let tris = 0;
  const showWalls = document.getElementById('walls').checked;
  const imps = [...document.querySelectorAll('#imps [data-imp]')].filter((e) => e.checked).map((e) => e.dataset.imp);
  const port = document.getElementById('port').checked, far = document.getElementById('far').checked, river = document.getElementById('river').checked;
  CULTURES.forEach((culture, row) => SIZES.forEach((S, col) => {
    const seed = seedBase * 7919 + row * 131 + col * 17;
    const r = Math.sin(seed) * 10000;
    const nG = S.major ? 3 : 2, a0 = (r - Math.floor(r)) * TAU;
    const gates = Array.from({ length: nG }, (_, k) => a0 + k * TAU / nG + (k ? 0.3 : 0));
    const onSea = port && S.capital;
    // a river crossing the town, gently bent
    const water = [];
    if (river) {
      const L = (S.major ? 1.6 : 0.95) + 0.5, n = 12;
      for (let k = 0; k < n; k++) {
        const p = (t) => [-L + 2 * L * t, 0.25 * Math.sin(t * 3 + seed) - 0.15];
        water.push({ a: p(k / n), b: p((k + 1) / n), w: 0.2 });
      }
    }
    const spec = { seed, R: S.major ? 1.6 : 0.95, gates, major: S.major, capital: S.capital, port: onSea, portAng: onSea ? a0 + Math.PI * 0.8 : null, culture, imps, water };
    const x = (col - (SIZES.length - 1) / 2) * GAP, z = (row - (CULTURES.length - 1) / 2) * GAP;
    const city = new THREE.Mesh(cityGeometry(planCity(spec), far), MAT);
    const w = wallParts(spec, S.walls);
    const meshes = [city];
    for (const W of water) {
      const dx = W.b[0] - W.a[0], dz = W.b[1] - W.a[1], len = Math.hypot(dx, dz);
      const m = new THREE.Mesh(new THREE.BoxGeometry(W.w * 2, 0.01, len + 0.02), WATER);
      m.position.set((W.a[0] + W.b[0]) / 2, 0.05, (W.a[1] + W.b[1]) / 2); m.rotation.y = Math.atan2(dx, dz);
      m.position.x += x; m.position.z += z; board.add(m);
    }
    if (showWalls && w.parts.length) meshes.push(new THREE.Mesh(merge(w.parts), MAT));
    for (const m of meshes) {
      m.position.set(x, 0, z); m.castShadow = true; m.receiveShadow = true;
      board.add(m);
      tris += m.geometry.attributes.position.count / 3;
    }
    const el = document.createElement('div');
    el.className = 'tag';
    el.textContent = `${culture} · ${S.name}`;
    document.body.appendChild(el);
    tags.push({ el, p: new THREE.Vector3(x, 0, z + (S.major ? 1.9 : 1.25)) });
  }));
  document.getElementById('stats').textContent = ` ${Math.round(tris / 1000)}k triangles`;
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();
camera.position.set(0, 15, 15);
controls.target.set(0, 0, 0);
document.getElementById('reseed').onclick = () => { seedBase++; build(); };
document.getElementById('walls').onchange = () => build();
document.getElementById('far').onchange = () => build();
// the Blender landmarks replace the procedural ones once loaded
let landmarks = false;
loadLandmarkModels(() => { landmarks = true; build(); });
for (const el of document.querySelectorAll('#imps input')) el.onchange = () => build();
build();

const v = new THREE.Vector3();
function frame() {
  requestAnimationFrame(frame);
  controls.update();
  renderer.render(scene, camera);
  for (const t of tags) {
    v.copy(t.p).project(camera);
    t.el.style.display = v.z < 1 ? '' : 'none';
    t.el.style.left = `${(v.x + 1) / 2 * window.innerWidth}px`;
    t.el.style.top = `${(1 - v.y) / 2 * window.innerHeight}px`;
  }
}
frame();
// for scripted screenshots
window.__LAB = { camera, controls, build, scene, ready: () => landmarks };
