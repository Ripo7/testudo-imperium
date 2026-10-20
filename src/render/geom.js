import { THREE } from '../three.js';
import { TAU } from '../core/math.js';

/* =========================================================
   Geometry helpers: primitives and merging parts into one coloured geometry.
   No renderer here, so pages other than the game (citylab.html) can use them.
   ========================================================= */
export const cyl = (rt, rb, h, s = 10, open = false, ts = 0, tl = TAU) => new THREE.CylinderGeometry(rt, rb, h, s, 1, open, ts, tl);
export const sph = (r, ws = 10, hs = 8) => new THREE.SphereGeometry(r, ws, hs);
export const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
export const cone = (r, h, s = 8) => new THREE.ConeGeometry(r, h, s);
export const _gm = new THREE.Matrix4(), _gq = new THREE.Quaternion(), _ge = new THREE.Euler(), _gp = new THREE.Vector3(), _gs = new THREE.Vector3();
export const _gn = new THREE.Matrix3(), _gc = new THREE.Color();
// parts: [{ geo, color, pos, rot (Euler XYZ), scale, tint }] -> one non-indexed geometry with vertex colours (color null:
// the geometry's own); each part's
// vertices are written straight into the result (no copies of the parts' geometries)
export function merge(parts, withTint) {
  let total = 0;
  for (const p of parts) total += p.geo.index ? p.geo.index.count : p.geo.attributes.position.count;
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3);
  const tint = withTint ? new Float32Array(total) : null;
  let o = 0;
  for (const p of parts) {
    const g = p.geo, P = g.attributes.position.array, N = g.attributes.normal.array, I = g.index ? g.index.array : null;
    const n = I ? I.length : P.length / 3;
    let e = null, m = null;
    if (p.pos || p.rot || p.scale) {
      const r = p.rot || [0, 0, 0], ps = p.pos || [0, 0, 0], sc = p.scale || [1, 1, 1];
      _ge.set(r[0], r[1], r[2]); _gq.setFromEuler(_ge);
      _gm.compose(_gp.set(ps[0], ps[1], ps[2]), _gq, _gs.set(sc[0], sc[1], sc[2]));
      e = _gm.elements; m = _gn.getNormalMatrix(_gm).elements;
    }
    const C = p.color == null && g.attributes.color ? g.attributes.color.array : null;   // a model with its own colours
    if (!C) _gc.set(p.color);
    const cr = _gc.r, cg = _gc.g, cb = _gc.b, t = p.tint ? 1 : 0;
    for (let k = 0; k < n; k++) {
      const v = (I ? I[k] : k) * 3, q = (o + k) * 3;
      const x = P[v], y = P[v + 1], z = P[v + 2];
      let nx = N[v], ny = N[v + 1], nz = N[v + 2];
      if (e) {
        pos[q] = e[0] * x + e[4] * y + e[8] * z + e[12];
        pos[q + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
        pos[q + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
        const ax = m[0] * nx + m[3] * ny + m[6] * nz, ay = m[1] * nx + m[4] * ny + m[7] * nz, az = m[2] * nx + m[5] * ny + m[8] * nz;
        const l = Math.hypot(ax, ay, az) || 1;
        nx = ax / l; ny = ay / l; nz = az / l;
      } else { pos[q] = x; pos[q + 1] = y; pos[q + 2] = z; }
      nor[q] = nx; nor[q + 1] = ny; nor[q + 2] = nz;
      if (C) { col[q] = C[v]; col[q + 1] = C[v + 1]; col[q + 2] = C[v + 2]; } else { col[q] = cr; col[q + 1] = cg; col[q + 2] = cb; }
      if (tint) tint[o + k] = t;
    }
    o += n;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (tint) out.setAttribute('aTint', new THREE.BufferAttribute(tint, 1));
  out.computeBoundingSphere();
  return out;
}

