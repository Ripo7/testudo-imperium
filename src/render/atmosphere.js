import { THREE } from '../three.js';
import { lerp, smooth } from '../core/util.js';
import { MAT } from './renderer.js';
import { CAM } from './camera.js';
import { DETAIL_TEX, TERRAIN_MAT } from './terrain.js';
import { RIVER_MAT, RIVER_U, WATER_MAT, WATER_U } from './water.js';
import { FLORA_MAT } from './vegetation.js';
import { FIELD_MAT, ROAD_MAT } from './cities.js';
import { MAP } from '../game/state.js';
import { SIGHT, viewer } from '../game/sight.js';

/* =========================================================
   Atmosphere: golden afternoon light, cool shadows, drifting
   cloud shadows, a painted sky with clouds on the horizon.
   ========================================================= */
export const LIGHT = {
  sunCol: '#ffd9a8', sunI: 2.05, skyCol: '#bfd4ef', groundCol: '#8a7550', hemiI: 0.62,
  off: new THREE.Vector3(-88, 92, 58),          // sun offset from the camera target (lower sun, longer shadows)
  haze: '#ebe3d1', zenith: '#79a3d4',
};
export const CLOUD_U = { uCloudTex: { value: null }, uCloudOff: { value: new THREE.Vector2() }, uCloudK: { value: 0.4 } };
export const CLOUD_GLSL = [
  'uniform sampler2D uCloudTex;', 'uniform vec2 uCloudOff;', 'uniform float uCloudK;',
  'float cloudMask(vec2 p) {',
  '  float a = texture2D(uCloudTex, p * 0.011 + uCloudOff).a * 0.65 + texture2D(uCloudTex, p * 0.024 + uCloudOff * 1.6 + vec2(0.31, 0.63)).a * 0.35;',
  '  return smoothstep(0.53, 0.67, a);',
  '}',
].join('\n');
// fog of war: outside the player's sight the world is greyed and darkened (see game/sight.js)
export const FOW_U = { uFowTex: { value: null }, uFowOn: { value: 0 }, uFowXf: { value: new THREE.Vector4(1, 1, 0.5, 0.5) } };
export const FOW_GLSL = [
  'uniform sampler2D uFowTex;', 'uniform float uFowOn;', 'uniform vec4 uFowXf;',
  'vec3 fowApply(vec3 c, vec2 p) {',
  '  if (uFowOn < 0.5) return c;',
  '  float v = texture2D(uFowTex, p * uFowXf.xy + uFowXf.zw).r;',
  '  float l = dot(c, vec3(0.299, 0.587, 0.114));',
  '  vec3 f = mix(vec3(l), c, 0.3) * 0.56 + vec3(0.012, 0.018, 0.032);',
  '  return mix(f, c, smoothstep(0.12, 0.62, v));',
  '}',
].join('\n');
{
  const t = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat);
  t.needsUpdate = true; FOW_U.uFowTex.value = t;
}
let fowVersion = -1, fowViewer = -1;
export function updateFogTexture() {
  FOW_U.uFowOn.value = SIGHT.on ? 1 : 0;
  if (!SIGHT.on || (SIGHT.version === fowVersion && viewer() === fowViewer)) return;
  const g = SIGHT.grids[viewer()];
  if (!g) return;
  fowVersion = SIGHT.version; fowViewer = viewer();
  const { W, H } = MAP;
  let t = FOW_U.uFowTex.value;
  if (t.image.width !== W || t.image.height !== H) {
    t.dispose();
    t = new THREE.DataTexture(new Uint8Array(W * H * 4), W, H, THREE.RGBAFormat);
    t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter;
    FOW_U.uFowTex.value = t;
    FOW_U.uFowXf.value.set(1 / W, 1 / H, 0.5, 0.5);   // world x = cell x - (W - 1) / 2
  }
  const d = t.image.data;
  for (let i = 0; i < g.length; i++) { const v = g[i]; d[i * 4] = v; d[i * 4 + 1] = v; d[i * 4 + 2] = v; d[i * 4 + 3] = 255; }
  t.needsUpdate = true;
}
// patch a lit material so the sun is dimmed under passing clouds
export function withClouds(mat) {
  if (mat.userData.clouds) return mat;
  mat.userData.clouds = true;
  const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(mat, sh, r);
    Object.assign(sh.uniforms, CLOUD_U, FOW_U);
    sh.vertexShader = 'varying vec3 vCloudWP;\n' + sh.vertexShader.replace('#include <project_vertex>', [
      '#include <project_vertex>',
      '{ vec4 cwp = vec4(transformed, 1.0);',
      '#ifdef USE_INSTANCING',
      '  cwp = instanceMatrix * cwp;',
      '#endif',
      '  vCloudWP = (modelMatrix * cwp).xyz; }',
    ].join('\n'));
    sh.fragmentShader = 'varying vec3 vCloudWP;\n' + CLOUD_GLSL + '\n' + FOW_GLSL + '\n' + sh.fragmentShader.replace('#include <lights_fragment_end>', [
      '#include <lights_fragment_end>',
      '{ float cs = 1.0 - uCloudK * cloudMask(vCloudWP.xz); reflectedLight.directDiffuse *= cs; reflectedLight.directSpecular *= cs; }',
    ].join('\n')).replace('#include <fog_fragment>', '#include <fog_fragment>\ngl_FragColor.rgb = fowApply(gl_FragColor.rgb, vCloudWP.xz);');
  };
  mat.customProgramCacheKey = () => (prevKey ? prevKey.call(mat) : '') + '+clouds+fow';
  mat.needsUpdate = true;
  return mat;
}

/* painted sky dome */
export const SKY_U = {
  uTop: { value: new THREE.Color(LIGHT.zenith) }, uHor: { value: new THREE.Color(LIGHT.haze) },
  uSun: { value: new THREE.Color('#ffe6bf') }, uSunDir: { value: LIGHT.off.clone().normalize() }, uTime: { value: 0 },
};
export const SKY_MAT = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false, uniforms: SKY_U,
  vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: [
    'uniform vec3 uTop; uniform vec3 uHor; uniform vec3 uSun; uniform vec3 uSunDir; uniform float uTime;',
    'varying vec3 vP;',
    'float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
    'float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);',
    '  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }',
    'void main() {',
    '  vec3 d = normalize(vP);',
    '  float h = clamp(d.y, 0.0, 1.0);',
    '  vec3 col = mix(uHor, uTop, pow(h, 0.42));',
    '  float sd = max(dot(d, uSunDir), 0.0);',
    '  col += uSun * (pow(sd, 10.0) * 0.28 + pow(sd, 300.0) * 1.2);',
    '  vec2 uv = d.xz / max(d.y + 0.12, 0.04) * 1.15 + vec2(uTime * 0.008, uTime * 0.003);',
    '  float n = vn(uv) * 0.5 + vn(uv * 2.13 + 3.1) * 0.3 + vn(uv * 4.7 + 7.7) * 0.2;',
    '  float band = smoothstep(0.015, 0.1, d.y) * (1.0 - smoothstep(0.3, 0.62, d.y));',
    '  float c = smoothstep(0.52, 0.72, n) * band;',
    '  vec3 cloud = mix(vec3(1.0, 0.96, 0.9), uSun, 0.25) * (0.82 + 0.3 * n) + vec3(0.06, 0.04, 0.0) * pow(sd, 4.0);',
    '  col = mix(col, cloud, c * 0.85);',
    '  gl_FragColor = vec4(col, 1.0);',
    '  #include <tonemapping_fragment>',
    '  #include <encodings_fragment>',
    '}',
  ].join('\n'),
});
export function updateAtmos() {
  const t = performance.now() / 1000;
  CLOUD_U.uCloudOff.value.set(t * 0.0055, t * 0.003);
  SKY_U.uTime.value = t;
  if (!CLOUD_U.uCloudTex.value && DETAIL_TEX) CLOUD_U.uCloudTex.value = DETAIL_TEX;
  // clouds a little lighter when looking from far away, so the political colours stay readable
  CLOUD_U.uCloudK.value = lerp(0.5, 0.36, smooth(60, 150, CAM.d));
}
// Start-up wiring, run once from main.js after every module has loaded.
export function initAtmosphere() {
  for (const m of [TERRAIN_MAT, FLORA_MAT.soft, FLORA_MAT.flat, MAT.vc, ROAD_MAT, FIELD_MAT, MAT.crowd]) withClouds(m);

  // water and rivers dim under the clouds too
  Object.assign(WATER_U, CLOUD_U, FOW_U); Object.assign(RIVER_U, CLOUD_U, FOW_U);
  WATER_MAT.fragmentShader = WATER_MAT.fragmentShader
    .replace('#include <common>', '#include <common>\n' + CLOUD_GLSL + '\n' + FOW_GLSL)
    .replace("  float alpha = mix(0.42", "  col *= 1.0 - uCloudK * 0.55 * cloudMask(vWP.xz) * inMap;\n  col = fowApply(col, vWP.xz);\n  float alpha = mix(0.42");
  RIVER_MAT.fragmentShader = RIVER_MAT.fragmentShader
    .replace('#include <common>', '#include <common>\n' + CLOUD_GLSL + '\n' + FOW_GLSL)
    .replace('  gl_FragColor = vec4(col, alpha);', '  col *= 1.0 - uCloudK * 0.55 * cloudMask(vWP.xz);\n  col = fowApply(col, vWP.xz);\n  gl_FragColor = vec4(col, alpha);');
}
