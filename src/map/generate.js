/* =========================================================
   Map generation (pure — no THREE, testable in node)
   ========================================================= */
export const MW = 192, MH = 128;
export const BIOME = { DEEP: 0, SEA: 1, BEACH: 2, PLAINS: 3, STEPPE: 4, FOREST: 5, DESERT: 6, HILLS: 7, MOUNTAIN: 8, SNOW: 9, LAKE: 10 };
export const BIOME_NAME = ['Deep sea', 'Sea', 'Coast', 'Plains', 'Steppe', 'Forest', 'Desert', 'Hills', 'Mountains', 'Peaks', 'Lake'];

export function rng32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function makePerlin(seed) {
  const r = rng32(seed);
  const perm = []; for (let i = 0; i < 256; i++) perm.push(i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
  const p = new Uint8Array(512); for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const grad = (h, x, y) => { switch (h & 7) { case 0: return x + y; case 1: return -x + y; case 2: return x - y; case 3: return -x - y; case 4: return x; case 5: return -x; case 6: return y; default: return -y; } };
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const L = (a, b, t) => a + (b - a) * t;
  return (x, y) => {
    let X = Math.floor(x), Y = Math.floor(y);
    x -= X; y -= Y; X &= 255; Y &= 255;
    const u = fade(x), v = fade(y), a = p[X] + Y, b = p[X + 1] + Y;
    return L(L(grad(p[a], x, y), grad(p[b], x - 1, y), u), L(grad(p[a + 1], x, y - 1), grad(p[b + 1], x - 1, y - 1), u), v) * 0.75;
  };
}
export function fbm(n, x, y, oct) {
  let a = 1, f = 1, s = 0, norm = 0;
  for (let i = 0; i < oct; i++) { s += a * n(x * f, y * f); norm += a; a *= 0.5; f *= 2.03; }
  return s / norm;
}
export const sstep = (e0, e1, x) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

// binary min-heap keyed by float
export class Heap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, val) {
    const k = this.k, v = this.v; let i = k.length; k.push(key); v.push(val);
    while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= key) break; k[i] = k[p]; v[i] = v[p]; i = p; }
    k[i] = key; v[i] = val;
  }
  pop() {
    const k = this.k, v = this.v, top = v[0], lk = k.pop(), lv = v.pop();
    if (k.length) {
      let i = 0; const n = k.length;
      for (;;) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && k[c + 1] < k[c]) c++; if (k[c] >= lk) break; k[i] = k[c]; v[i] = v[c]; i = c; }
      k[i] = lk; v[i] = lv;
    }
    return top;
  }
  peekKey() { return this.k[0]; }
}

export const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
export const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

export const PROV_A = ['Aqui', 'Bel', 'Cal', 'Dar', 'Ger', 'Hispa', 'Illy', 'Lusi', 'Mar', 'Nor', 'Pan', 'Rae', 'Sar', 'Tarra', 'Vesto', 'Acha', 'Bithy', 'Cili', 'Dalma', 'Gala', 'Lyca', 'Mesa', 'Numi', 'Pisi', 'Thra', 'Syra', 'Ponti', 'Arme', 'Cappa', 'Ligu', 'Etru', 'Samni', 'Bruti', 'Corsi', 'Venu', 'Ombri', 'Seque', 'Helve', 'Dacu', 'Moesa'];
export const PROV_B = ['tania', 'gica', 'ria', 'donia', 'nia', 'cia', 'tica', 'lia', 'rica', 'sia', 'ntia', 'mia', 'bria'];
export const CITY_A = ['Bur', 'Lug', 'Med', 'Ver', 'Aug', 'Col', 'Nar', 'Tol', 'Vin', 'Sal', 'Tar', 'Ebur', 'Cam', 'Lon', 'Mog', 'Arel', 'Nem', 'Gen', 'Ant', 'Ost', 'Pal', 'Cor', 'Sag', 'Leuc', 'Bri', 'Cast', 'Dur', 'Gad', 'Hel', 'Ilu', 'Mas', 'Nov', 'Pis', 'Rav', 'Sir', 'Tib', 'Ulp', 'Vol', 'Alb', 'Ber', 'Cel', 'Dam', 'Lept', 'Uti', 'Hip', 'Cyr', 'Myl', 'Pel'];
export const CITY_B = ['dunum', 'igala', 'iolanum', 'ona', 'usta', 'onia', 'bo', 'osa', 'dobona', 'acum', 'ium', 'entum', 'ula', 'is', 'aco', 'ensis', 'ana', 'oria', 'ica', 'ae', 'ara', 'ilia', 'eia', 'opolis'];

export function generateMap(seed) {
  const W = MW, H = MH, N = W * H;
  const r = rng32(seed * 7919 + 17);
  const nA = makePerlin(seed + 1), nB = makePerlin(seed + 2), nC = makePerlin(seed + 3), nM = makePerlin(seed + 4), nW = makePerlin(seed + 5);
  const elev = new Float32Array(N), moist = new Float32Array(N), temp = new Float32Array(N);
  const biome = new Uint8Array(N);
  const ox = r() * 100, oy = r() * 100;

  // --- elevation
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const wx = x + fbm(nW, x * 0.022 + ox, y * 0.022, 4) * 20, wy = y + fbm(nW, x * 0.022 + 50, y * 0.022 + oy, 4) * 20;
    const cx = (wx / W - 0.5) / 0.5, cy = (wy / H - 0.5) / 0.5;
    const d = Math.sqrt(cx * cx + cy * cy);
    const mask = 1 - sstep(0.62, 1.08, d);
    const base = fbm(nA, wx * 0.02 + ox, wy * 0.02 + oy, 5);
    let e = base * 0.98 + mask * 0.64 - 0.265;
    const ridge = Math.pow(Math.max(0, 1 - Math.abs(fbm(nB, wx * 0.024, wy * 0.024, 4)) * 1.7), 2.5);
    const mRange = sstep(-0.06, 0.2, fbm(nC, wx * 0.014 + 20, wy * 0.014, 3));
    if (e > 0) e += ridge * mRange * 0.62 * sstep(0.0, 0.1, e) + base * 0.05;
    if (x < 2 || y < 2 || x > W - 3 || y > H - 3) e = Math.min(e, -0.2);
    elev[i] = e;
  }

  // --- keep the largest landmass only
  const comp = new Int32Array(N).fill(-1);
  let best = -1, bestSize = 0, cid = 0;
  const stack = [];
  for (let i = 0; i < N; i++) {
    if (elev[i] < 0 || comp[i] !== -1) continue;
    let size = 0; stack.push(i); comp[i] = cid;
    while (stack.length) {
      const c = stack.pop(); size++;
      const cx = c % W, cy = (c / W) | 0;
      for (const [dx, dy] of N4) {
        const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const n = ny * W + nx; if (elev[n] >= 0 && comp[n] === -1) { comp[n] = cid; stack.push(n); }
      }
    }
    if (size > bestSize) { bestSize = size; best = cid; }
    cid++;
  }
  for (let i = 0; i < N; i++) if (elev[i] >= 0 && comp[i] !== best) elev[i] = -0.04 - r() * 0.02;

  // --- ocean connectivity (lakes = water not connected to the border)
  const ocean = new Uint8Array(N);
  for (let x = 0; x < W; x++) { stack.push(x, (H - 1) * W + x); }
  for (let y = 0; y < H; y++) { stack.push(y * W, y * W + W - 1); }
  while (stack.length) {
    const c = stack.pop(); if (ocean[c] || elev[c] >= 0) continue; ocean[c] = 1;
    const cx = c % W, cy = (c / W) | 0;
    for (const [dx, dy] of N4) { const nx = cx + dx, ny = cy + dy; if (nx >= 0 && ny >= 0 && nx < W && ny < H) stack.push(ny * W + nx); }
  }

  // --- fill small lakes, keep at most a couple of big ones
  {
    const seenL = new Uint8Array(N); const lakes = [];
    for (let i = 0; i < N; i++) {
      if (ocean[i] || elev[i] >= 0 || seenL[i]) continue;
      const cells = []; stack.push(i); seenL[i] = 1;
      while (stack.length) { const c = stack.pop(); cells.push(c); const cx = c % W, cy = (c / W) | 0;
        for (const [dx, dy] of N4) { const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const n = ny * W + nx; if (!ocean[n] && elev[n] < 0 && !seenL[n]) { seenL[n] = 1; stack.push(n); } } }
      lakes.push(cells);
    }
    lakes.sort((a, b) => b.length - a.length);
    lakes.forEach((cells, k) => { if (k >= 2 || cells.length < 40) for (const c of cells) elev[c] = 0.01 + r() * 0.02; });
  }
  // --- distance to sea (for moisture)
  const seaDist = new Float32Array(N).fill(1e9);
  const q = [];
  for (let i = 0; i < N; i++) if (elev[i] < 0) { seaDist[i] = 0; q.push(i); }
  for (let h = 0; h < q.length; h++) {
    const c = q[h], cx = c % W, cy = (c / W) | 0;
    for (const [dx, dy] of N4) {
      const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const n = ny * W + nx; if (seaDist[n] > seaDist[c] + 1) { seaDist[n] = seaDist[c] + 1; q.push(n); }
    }
  }

  // --- priority flood: drainage tree to the ocean (rivers follow it)
  const filled = new Float32Array(N), down = new Int32Array(N).fill(-1), seen = new Uint8Array(N);
  const heap = new Heap();
  for (let i = 0; i < N; i++) if (ocean[i]) { seen[i] = 1; filled[i] = elev[i]; }
  for (let i = 0; i < N; i++) {
    if (!ocean[i]) continue;
    const cx = i % W, cy = (i / W) | 0;
    for (const [dx, dy] of N4) {
      const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const n = ny * W + nx; if (!seen[n]) { seen[n] = 1; filled[n] = Math.max(elev[n], 0); down[n] = i; heap.push(filled[n], n); }
    }
  }
  while (heap.size) {
    const c = heap.pop(), cx = c % W, cy = (c / W) | 0;
    for (const [dx, dy] of N4) {
      const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const n = ny * W + nx; if (seen[n]) continue;
      seen[n] = 1; filled[n] = Math.max(elev[n], filled[c] + 1e-4); down[n] = c; heap.push(filled[n], n);
    }
  }

  // --- moisture & temperature, biomes
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, e = elev[i];
    moist[i] = 0.52 + fbm(nM, x * 0.02 + 7, y * 0.02, 4) * 1.1 + Math.max(0, 0.18 - seaDist[i] * 0.012);
    temp[i] = 0.12 + (y / H) * 0.95 - Math.max(0, e) * 0.45 + fbm(nM, x * 0.01 + 99, y * 0.01, 2) * 0.25;
  }
  const landE = []; for (let i = 0; i < N; i++) if (elev[i] >= 0) landE.push(elev[i]);
  landE.sort((a, b) => a - b);
  const pct = (q) => landE[Math.min(landE.length - 1, Math.floor(landE.length * q))];
  const eHill = pct(0.74), eMount = pct(0.89), eSnow = pct(0.975);
  for (let i = 0; i < N; i++) {
    const e = elev[i];
    let b;
    if (e < 0) b = !ocean[i] ? BIOME.LAKE : e < -0.13 ? BIOME.DEEP : BIOME.SEA;
    else if (e < 0.022 && seaDist[i] <= 2) b = BIOME.BEACH;
    else if (e > eSnow) b = BIOME.SNOW;
    else if (e > eMount) b = BIOME.MOUNTAIN;
    else if (e > eHill) b = BIOME.HILLS;
    else if (temp[i] > 0.62 && moist[i] < 0.54) b = BIOME.DESERT;
    else if (moist[i] > 0.66 && temp[i] < 0.82) b = BIOME.FOREST;
    else if (moist[i] < 0.42) b = BIOME.STEPPE;
    else b = BIOME.PLAINS;
    biome[i] = b;
  }

  // --- rivers
  const river = new Uint8Array(N); // 0 none, 1.. flow strength
  const rivers = [];
  const cand = [];
  for (let i = 0; i < N; i++) {
    const b = biome[i];
    if ((b === BIOME.HILLS || b === BIOME.MOUNTAIN) && moist[i] > 0.42 && temp[i] < 0.85) cand.push(i);
  }
  for (let k = cand.length - 1; k > 0; k--) { const j = Math.floor(r() * (k + 1)); const t = cand[k]; cand[k] = cand[j]; cand[j] = t; }
  const srcs = [];
  for (const c of cand) {
    if (srcs.length >= 14) break;
    const cx = c % W, cy = (c / W) | 0;
    if (srcs.some((s) => Math.hypot(s % W - cx, ((s / W) | 0) - cy) < 14)) continue;
    const path = [];
    let cur = c, ok = false, guard = 0;
    while (cur >= 0 && guard++ < 600) {
      path.push(cur);
      if (elev[cur] < 0) { ok = true; break; }
      if (river[cur]) { ok = true; break; }
      cur = down[cur];
    }
    if (!ok || path.length < 12) continue;
    srcs.push(c);
    const cells = [];
    for (const p of path) {
      if (elev[p] < 0) { cells.push(p); break; }
      cells.push(p);
      if (river[p]) { river[p] = Math.min(255, river[p] + 2); break; }
      river[p] = 1;
    }
    rivers.push(cells);
  }
  // flow accumulation along each river (downstream gets wider)
  for (const rv of rivers) rv.forEach((c, k) => { if (elev[c] >= 0) river[c] = Math.min(6, Math.max(river[c], 1 + Math.floor(k / 18))); });
  for (let i = 0; i < N; i++) if (river[i] && elev[i] >= 0) elev[i] = Math.max(0.006, elev[i] - 0.02);

  // --- terrain move cost
  const cost = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const b = biome[i];
    let c = b <= BIOME.SEA || b === BIOME.LAKE ? Infinity
      : b === BIOME.SNOW ? 7 : b === BIOME.MOUNTAIN ? 3.6 : b === BIOME.HILLS ? 1.7 : b === BIOME.FOREST ? 1.5
      : b === BIOME.DESERT ? 1.25 : 1;
    if (river[i] && c < Infinity) c += 2.2;
    cost[i] = c;
  }
  const passable = (i) => cost[i] < Infinity;

  // --- provinces: seeds by poisson sampling, then weighted flood
  let landCount = 0; for (let i = 0; i < N; i++) if (passable(i)) landCount++;
  const NP = 18;
  const seedCand = [];
  for (let i = 0; i < N; i++) {
    const b = biome[i];
    if (!passable(i) || b === BIOME.MOUNTAIN || b === BIOME.SNOW || river[i]) continue;
    const x = i % W, y = (i / W) | 0;
    if (x < 6 || y < 6 || x > W - 7 || y > H - 7) continue;
    let s = r();
    for (const [dx, dy] of N8) { const n = (y + dy) * W + x + dx; if (river[n]) s += 0.8; if (biome[n] === BIOME.SEA) s += 0.5; }
    if (b === BIOME.PLAINS) s += 0.3;
    if (b === BIOME.DESERT) s -= 0.3;
    seedCand.push([s, i]);
  }
  for (let k = seedCand.length - 1; k > 0; k--) { const j = Math.floor(r() * (k + 1)); const t = seedCand[k]; seedCand[k] = seedCand[j]; seedCand[j] = t; }
  let dmin = Math.sqrt(landCount / NP) * 0.95;
  let seeds = [];
  for (let attempt = 0; attempt < 8 && seeds.length < NP; attempt++) {
    seeds = [];
    for (const [, i] of seedCand) {
      const x = i % W, y = (i / W) | 0;
      if (seeds.every((s) => Math.hypot(s % W - x, ((s / W) | 0) - y) >= dmin)) seeds.push(i);
      if (seeds.length >= NP) break;
    }
    dmin *= 0.9;
  }
  // Lloyd relaxation (euclidean voronoi on land) to even out province sizes
  const validSeed = new Uint8Array(N);
  for (const [, i] of seedCand) validSeed[i] = 1;
  for (let it = 0; it < 5; it++) {
    const sx = new Float64Array(seeds.length), sy = new Float64Array(seeds.length), sn = new Float64Array(seeds.length);
    const pts = seeds.map((s) => [s % W, (s / W) | 0]);
    for (let i = 0; i < N; i++) {
      if (!passable(i)) continue;
      const x = i % W, y = (i / W) | 0; let bk = 0, bd = Infinity;
      for (let k = 0; k < pts.length; k++) { const dx = pts[k][0] - x, dy = pts[k][1] - y, d = dx * dx + dy * dy; if (d < bd) { bd = d; bk = k; } }
      sx[bk] += x; sy[bk] += y; sn[bk]++;
    }
    seeds = seeds.map((s, k) => {
      if (!sn[k]) return s;
      const tx = sx[k] / sn[k], ty = sy[k] / sn[k];
      let bi = s, bs = -Infinity;
      for (let dy = -7; dy <= 7; dy++) for (let dx = -7; dx <= 7; dx++) {
        const x = Math.round(tx) + dx, y = Math.round(ty) + dy; if (x < 6 || y < 6 || x > W - 7 || y > H - 7) continue;
        const i = y * W + x; if (!validSeed[i]) continue;
        let sc = -Math.hypot(x - tx, y - ty) * (it < 4 ? 1 : 0.35);
        if (it === 4) for (const [ddx, ddy] of N8) { const n = (y + ddy) * W + x + ddx; if (river[n]) sc += 1.2; if (biome[n] === BIOME.SEA) sc += 0.6; }
        if (sc > bs) { bs = sc; bi = i; }
      }
      return bi;
    });
  }
  const prov = new Int16Array(N).fill(-1), pdist = new Float32Array(N).fill(Infinity);
  const ph = new Heap();
  seeds.forEach((s, k) => { prov[s] = k; pdist[s] = 0; ph.push(0, s); });
  while (ph.size) {
    const d0 = ph.peekKey(), c = ph.pop();
    if (d0 > pdist[c]) continue;
    const cx = c % W, cy = (c / W) | 0;
    for (const [dx, dy] of N8) {
      const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const n = ny * W + nx; if (!passable(n)) continue;
      const nd = d0 + cost[n] * (dx && dy ? 1.414 : 1) + (river[n] ? 3 : 0);
      if (nd < pdist[n]) { pdist[n] = nd; prov[n] = prov[c]; ph.push(nd, n); }
    }
  }
  // unreachable land (rare): attach to the nearest province
  for (let i = 0; i < N; i++) if (passable(i) && prov[i] < 0) {
    const x = i % W, y = (i / W) | 0; let bk = 0, bd = Infinity;
    seeds.forEach((s, k) => { const d = Math.hypot(s % W - x, ((s / W) | 0) - y); if (d < bd) { bd = d; bk = k; } });
    prov[i] = bk;
  }

  // --- provinces data
  const usedNames = new Set();
  const uname = (A, B) => { for (let t = 0; t < 200; t++) { const n = A[Math.floor(r() * A.length)] + B[Math.floor(r() * B.length)]; if (!usedNames.has(n)) { usedNames.add(n); return n; } } return 'Nova' + usedNames.size; };
  const provinces = seeds.map((s, k) => ({ id: k, name: uname(PROV_A, PROV_B), cells: [], neighbors: new Set(), counts: new Array(11).fill(0), cx: 0, cy: 0, river: 0, coast: 0 }));
  for (let i = 0; i < N; i++) {
    const p = prov[i]; if (p < 0) continue;
    const P = provinces[p]; P.cells.push(i); P.counts[biome[i]]++;
    const x = i % W, y = (i / W) | 0; P.cx += x; P.cy += y;
    if (river[i]) P.river++;
    for (const [dx, dy] of N4) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const n = ny * W + nx; const q2 = prov[n];
      if (q2 >= 0 && q2 !== p) P.neighbors.add(q2);
      if (biome[n] === BIOME.SEA || biome[n] === BIOME.DEEP) P.coast++;
    }
  }
  for (const P of provinces) { P.cx /= Math.max(1, P.cells.length); P.cy /= Math.max(1, P.cells.length); P.neighbors = [...P.neighbors]; }

  // --- cities
  const cities = [];
  const distToBorder = new Float32Array(N).fill(99);
  {
    const qq = [];
    for (let i = 0; i < N; i++) {
      if (prov[i] < 0) continue;
      const x = i % W, y = (i / W) | 0;
      for (const [dx, dy] of N4) { const n = (y + dy) * W + x + dx; if (prov[n] !== prov[i]) { distToBorder[i] = 0; qq.push(i); break; } }
    }
    for (let h = 0; h < qq.length; h++) {
      const c = qq[h], cx = c % W, cy = (c / W) | 0;
      for (const [dx, dy] of N4) { const n = (cy + dy) * W + cx + dx; if (prov[n] >= 0 && distToBorder[n] > distToBorder[c] + 1) { distToBorder[n] = distToBorder[c] + 1; qq.push(n); } }
    }
  }
  const nearScore = (i) => {
    const x = i % W, y = (i / W) | 0; let s = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const n = (y + dy) * W + x + dx; if (n < 0 || n >= N) continue;
      if (river[n]) s += 0.25; if (biome[n] === BIOME.SEA) s += 0.12; if (biome[n] === BIOME.FOREST) s += 0.05; if (biome[n] === BIOME.HILLS) s += 0.05;
    }
    return s;
  };
  provinces.forEach((P, k) => {
    const s = seeds[k];
    // nudge major city off the river onto a dry neighbour
    const mc = { id: cities.length, name: uname(CITY_A, CITY_B), cell: s, x: s % W, y: (s / W) | 0, prov: k, major: true };
    cities.push(mc); P.major = mc.id; P.small = [];
    const want = P.cells.length > landCount / NP * 1.05 ? 3 : 2;
    const cand2 = [];
    for (const i of P.cells) {
      const b = biome[i];
      if (b === BIOME.MOUNTAIN || b === BIOME.SNOW || river[i] || distToBorder[i] < 2) continue;
      const x = i % W, y = (i / W) | 0;
      if (Math.hypot(x - mc.x, y - mc.y) < 7) continue;
      cand2.push([nearScore(i) + r() * 0.6 + (b === BIOME.DESERT ? -0.4 : 0), i]);
    }
    cand2.sort((a, b) => b[0] - a[0]);
    for (const [, i] of cand2) {
      if (P.small.length >= want) break;
      const x = i % W, y = (i / W) | 0;
      if (P.small.some((cidx) => Math.hypot(cities[cidx].x - x, cities[cidx].y - y) < 7)) continue;
      const c = { id: cities.length, name: uname(CITY_A, CITY_B), cell: i, x, y, prov: k, major: false };
      cities.push(c); P.small.push(c.id);
    }
  });
  // specialties for cities from surroundings
  for (const c of cities) {
    const t = new Array(11).fill(0); let rv = 0, coast = 0;
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = c.x + dx, y = c.y + dy; if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const n = y * W + x; t[biome[n]]++; if (river[n]) rv++; if (biome[n] === BIOME.SEA) coast++;
    }
    c.near = { forest: t[BIOME.FOREST], hills: t[BIOME.HILLS] + t[BIOME.MOUNTAIN] * 1.5, fertile: t[BIOME.PLAINS] + t[BIOME.STEPPE] * 0.5 + rv, coast, river: rv, desert: t[BIOME.DESERT] };
  }

  return { W, H, seed, elev, moist, temp, biome, river, rivers, cost, prov, provinces, cities, ocean, landCount, eHill, eMount, eSnow };
}
