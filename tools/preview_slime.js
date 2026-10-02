'use strict';
/*
 * tools/preview_slime.js  —  turn the acid_gel_slime bbmodel into things a human (and a
 * text-only reviewer) can judge.  OWNER: verifier.   Run:  node tools/preview_slime.js
 *
 *   docs/preview_front.png / preview_side.png / preview_34.png  (z-buffered software render,
 *       8 px per model unit, per-face texture sampling, flat directional shading + emissive
 *       glow layer from the _glow atlas)
 *   docs/preview_atlas.png  (base atlas 4x with tile boundaries, plus the glow atlas 4x
 *       composited over the base)
 *   stdout: front / side / top ASCII silhouettes (1 char = 1 model unit) and an accent map
 *       (G gel / A acid / E eye / C crystal / T tooth / M maw-mouth / K core / ? hidden tile)
 *       for the face that is actually visible in that direction.
 *
 * Texture orientation follows Blockbench's CubeFace.UVToLocal() semantics exactly, and the
 * geometry is drawn from the .bbmodel (element origin/rotation + bone hierarchy), so the
 * preview shows what Blockbench itself would show for the project file.
 * No external libraries: tools/lib/png.js (in-repo codec) is the only include.
 */

const fs = require('fs');
const path = require('path');
const png = require('./lib/png.js');

const ROOT = path.resolve(__dirname, '..');
const ID = 'acid_gel_slime';
const RES = 128;
const FACES = ['north', 'east', 'south', 'west', 'up', 'down'];
const S = 8;              // pixels per model unit for the rasterised views
const ATLAS_ZOOM = 4;     // 4x for docs/preview_atlas.png
const BG = [14, 20, 26, 255];
const LIGHT = norm([-0.35, 0.78, -0.52]); // direction *towards* the light (upper front left)
const AMBIENT = 0.42, DIFFUSE = 0.58, EMISSIVE = 0.9;

// ------------------------------------------------------------------ helpers --
function norm(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function scale(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
const D2R = Math.PI / 180;
function mat4Identity() { return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; }
function mat4Mul(a, b) { const o = new Array(16).fill(0); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += a[i * 4 + k] * b[k * 4 + j]; o[i * 4 + j] = s; } return o; }
function mat4T(t) { const m = mat4Identity(); m[3] = t[0]; m[7] = t[1]; m[11] = t[2]; return m; }
function rotX(d) { const c = Math.cos(d * D2R), s = Math.sin(d * D2R); return [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0, 0, 0, 0, 1]; }
function rotY(d) { const c = Math.cos(d * D2R), s = Math.sin(d * D2R); return [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, 0, 0, 0, 1]; }
function rotZ(d) { const c = Math.cos(d * D2R), s = Math.sin(d * D2R); return [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; }
function rotEuler(r) { return mat4Mul(mat4Mul(rotX(r[0]), rotY(r[1])), rotZ(r[2])); }
function apply(m, p) { return [m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3], m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7], m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11]]; }
function applyDir(m, p) { return [m[0] * p[0] + m[1] * p[1] + m[2] * p[2], m[4] * p[0] + m[5] * p[1] + m[6] * p[2], m[8] * p[0] + m[9] * p[1] + m[10] * p[2]]; }

// ------------------------------------------------------- load + build scene --
const bb = JSON.parse(fs.readFileSync(path.join(ROOT, ID + '.bbmodel'), 'utf8'));
let report = null; try { report = JSON.parse(fs.readFileSync(path.join(ROOT, 'build', 'report.json'), 'utf8')); } catch (e) { }
const tiles = (report && report.tiles) || [];
function tileOf(x, y) { return tiles.find(t => x >= t.rect[0] && y >= t.rect[1] && x < t.rect[2] && y < t.rect[3]); }
function texOf(i) {
  const t = bb.textures[i]; const im = png.decode(Buffer.from(t.source.slice('data:image/png;base64,'.length), 'base64'));
  return im;
}
const TEX = bb.textures.map((t, i) => texOf(i));

// Blockbench face->quad mapping (CubeFace.UVToLocal + getVertexIndices); s = stored uv numbers
function faceQuad(el, face) {
  const f = el.faces && el.faces[face];
  if (!f || !f.uv || f.texture === null || f.texture === undefined) return null;
  const [s0, s1, s2, s3] = f.uv;
  const fx = el.from[0], fy = el.from[1], fz = el.from[2], tx = el.to[0], ty = el.to[1], tz = el.to[2];
  const P = (x, y, z, u, v) => ({ p: [x, y, z], uv: [u, v] });
  switch (face) {
    case 'north': return { tex: f.texture, q: [P(tx, ty, fz, s0, s1), P(fx, ty, fz, s2, s1), P(fx, fy, fz, s2, s3), P(tx, fy, fz, s0, s3)], n: [0, 0, -1] };
    case 'south': return { tex: f.texture, q: [P(fx, ty, tz, s0, s1), P(tx, ty, tz, s2, s1), P(tx, fy, tz, s2, s3), P(fx, fy, tz, s0, s3)], n: [0, 0, 1] };
    case 'east': return { tex: f.texture, q: [P(tx, ty, tz, s0, s1), P(tx, ty, fz, s2, s1), P(tx, fy, fz, s2, s3), P(tx, fy, tz, s0, s3)], n: [1, 0, 0] };
    case 'west': return { tex: f.texture, q: [P(fx, ty, fz, s0, s1), P(fx, ty, tz, s2, s1), P(fx, fy, tz, s2, s3), P(fx, fy, fz, s0, s3)], n: [-1, 0, 0] };
    case 'up': return { tex: f.texture, q: [P(fx, ty, fz, s0, s1), P(tx, ty, fz, s2, s1), P(tx, ty, tz, s2, s3), P(fx, ty, tz, s0, s3)], n: [0, 1, 0] };
    case 'down': return { tex: f.texture, q: [P(fx, fy, tz, s0, s1), P(tx, fy, tz, s2, s1), P(tx, fy, fz, s2, s3), P(fx, fy, fz, s0, s3)], n: [0, -1, 0] };
  }
  return null;
}
// accent letter for a face: prefer the atlas family, fall back to the cube name
function letterFor(el, face, family) {
  const n = (el.name || '').toLowerCase(), fb = family || '';
  if (fb === 'void' || fb === 'seam') return '?';
  if (/xtal|crystal/.test(fb) || /xtal|crystal/.test(n)) return 'C';
  if (/tooth/.test(fb) || /fang|tooth/.test(n)) return 'T';
  if (/maw/.test(fb) || /tongue/.test(fb) || /maw|tongue/.test(n)) return 'M';
  if (/lip/.test(fb) || /lip/.test(n)) return 'M';
  if (/eye/.test(fb) || (/eye/.test(n) && !/lid/.test(n))) return 'E';
  if (/core/.test(fb) || /core/.test(n)) return 'K';
  if (/acid|bead|bulb/.test(fb) || /acid|bead|bulb/.test(n)) return 'A';
  if (/brow/.test(fb) || /lid/.test(fb) || /gel|skirt|drip|lobe|knob|stalk|streak/.test(fb)) return 'G';
  if (/eye/.test(n)) return 'E';
  if (/skirt|drip|lobe|knob|stalk|dome|bead/.test(n)) return 'G';
  return 'G';
}
function buildScene() {
  const groups = new Map(bb.groups.map(g => [g.uuid, g]));
  const parent = new Map(), owner = new Map();
  // the tree may live in the outliner (normal Blockbench files) or in groups[].children
  // (see VERIFY.md finding V-01); read whichever one actually carries the rig.
  function walkRec(nodes, pg) { for (const n of nodes || []) { if (typeof n === 'string') { if (!owner.has(n)) owner.set(n, pg); } else if (n && typeof n === 'object') { if (!parent.has(n.uuid)) parent.set(n.uuid, pg); walkRec(n.children, n.uuid); } } };
  walkRec(bb.outliner, null);
  const oGroups = parent.size, oEls = owner.size;
  for (const g of bb.groups) walkRec(g.children, g.uuid);
  const useRecords = parent.size > oGroups || owner.size > oEls;
  const order = [];
  { const ids = [...groups.keys()]; let guard = 0;
    while (order.length < ids.length && guard++ < ids.length + 2) for (const u of ids) if (!order.includes(u) && (!parent.get(u) || order.includes(parent.get(u)))) order.push(u);
    for (const u of ids) if (!order.includes(u)) order.push(u); }
  const boneMat = new Map();
  const quads = [];
  const cubes = [];
  for (const u of order) {
    const g = groups.get(u) || {};
    const pivot = g.origin || [0, 0, 0], rot = g.rotation || [0, 0, 0];
    let m = mat4Mul(mat4T(pivot), rotEuler(rot)); m = mat4Mul(m, mat4T(scale(pivot, -1)));
    const pm = parent.get(u) ? boneMat.get(parent.get(u)) : null;
    const world = pm ? mat4Mul(pm, m) : m;
    boneMat.set(u, world);
  }
  for (const el of bb.elements) {
    const bu = owner.get(el.uuid);
    const B = boneMat.get(bu) || mat4Identity();
    const org = el.origin || el.from, r = el.rotation || [0, 0, 0];
    const cubeMat = (r.some(v => v)) ? mat4Mul(mat4T(org), rotEuler(r)) : null;
    const X = p => { const p2 = cubeMat ? apply(cubeMat, sub(p, org)) : p; return apply(B, p2); };  // cubeMat = T(origin)*R
    const cube = { name: el.name, bone: (groups.get(bu) || {}).name || '?', from: X(el.from), to: X(el.to) };
    cube.from = el.from.map((v, i) => Math.min(X(el.from)[i], X(el.to)[i]));
    cube.to = el.to.map((v, i) => Math.max(X(el.from)[i], X(el.to)[i]));
    cubes.push(cube);
    for (const f of FACES) {
      const fq = faceQuad(el, f);
      if (!fq) continue;
      const fam = tileOf(Math.min(fq.q[0].uv[0], fq.q[2].uv[0]), Math.min(fq.q[0].uv[1], fq.q[2].uv[1]));
      const P = fq.q.map(c => X(c.p));
      const nrm = applyDir(B, fq.n);
      quads.push({ p: P, uv: fq.q.map(c => c.uv), tex: fq.tex, n: nrm, letter: letterFor(el, f, fam && fam.family), fam: fam ? fam.family : '?', cube: el.name, bone: (groups.get(bu) || {}).name || '?' });
    }
  }
  return { quads, cubes, order, groups };
}
const scene = buildScene();

// ------------------------------------------------------------------ raster ---
function renderView(dir, upHint, opts = {}) {
  const f = norm(dir);
  let w = upHint || [0, 1, 0];
  if (Math.abs(dot(f, norm(w))) > 0.99) w = [0, 0, -1];
  const r = norm(cross(f, norm(w)));
  const u = cross(r, f);
  let uMin = 1e9, uMax = -1e9, vMin = 1e9, vMax = -1e9, dMin = 1e9, dMax = -1e9;
  for (const q of scene.quads) for (const p of q.p) {
    const a = dot(p, r), b = dot(p, u), c = dot(p, f);
    uMin = Math.min(uMin, a); uMax = Math.max(uMax, a);
    vMin = Math.min(vMin, b); vMax = Math.max(vMax, b);
    dMin = Math.min(dMin, c); dMax = Math.max(dMax, c);
  }
  const pad = opts.align === false ? 0 : 1;
  uMin = Math.floor(uMin) - pad; uMax = Math.ceil(uMax) + pad;
  vMin = Math.floor(vMin) - pad; vMax = Math.ceil(vMax) + pad;
  const W = Math.max(1, Math.round((uMax - uMin) * S)), H = Math.max(1, Math.round((vMax - vMin) * S));
  const color = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) { color[i * 4] = BG[0]; color[i * 4 + 1] = BG[1]; color[i * 4 + 2] = BG[2]; color[i * 4 + 3] = 255; }
  const depth = new Float32Array(W * H).fill(Infinity);
  const tag = new Array(W * H).fill(null);
  const shade = Math.max(0, dot(LIGHT, [0, 0, 1])) * 0; // (kept explicit below)
  for (const q of scene.quads) {
    if (opts.filter && !opts.filter(q)) continue;
    const sp = q.p.map(p => [(( dot(p, r) - uMin) * S), ((vMax - dot(p, u)) * S), dot(p, f)]);
    const sh = AMBIENT + DIFFUSE * Math.max(0, dot(q.n, LIGHT));
    const x0 = Math.max(0, Math.floor(Math.min(sp[0][0], sp[1][0], sp[2][0], sp[3][0]))), x1 = Math.min(W - 1, Math.ceil(Math.max(sp[0][0], sp[1][0], sp[2][0], sp[3][0])));
    const y0 = Math.max(0, Math.floor(Math.min(sp[0][1], sp[1][1], sp[2][1], sp[3][1]))), y1 = Math.min(H - 1, Math.ceil(Math.max(sp[0][1], sp[1][1], sp[2][1], sp[3][1])));
    const img = TEX[q.tex];
    if (x1 < x0 || y1 < y0) continue;
    for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
      const cx = px + 0.5, cy = py + 0.5;
      // triangulate (0,1,2) and (0,2,3) and use screen-space barycentric interpolation
      let hit = null;
      for (const tri of [[0, 1, 2], [0, 2, 3]]) {
        const A = sp[tri[0]], Bv = sp[tri[1]], C = sp[tri[2]];
        const d = (Bv[1] - C[1]) * (A[0] - C[0]) + (C[0] - Bv[0]) * (A[1] - C[1]);
        if (Math.abs(d) < 1e-9) continue;
        const l1 = ((Bv[1] - C[1]) * (cx - C[0]) + (C[0] - Bv[0]) * (cy - C[1])) / d;
        const l2 = ((C[1] - A[1]) * (cx - C[0]) + (A[0] - C[0]) * (cy - C[1])) / d;
        const l3 = 1 - l1 - l2;
        if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
        const z = l1 * A[2] + l2 * Bv[2] + l3 * C[2];
        const uu = l1 * q.uv[tri[0]][0] + l2 * q.uv[tri[1]][0] + l3 * q.uv[tri[2]][0];
        const vv = l1 * q.uv[tri[0]][1] + l2 * q.uv[tri[1]][1] + l3 * q.uv[tri[2]][1];
        hit = { z, u: uu, v: vv }; break;
      }
      if (!hit) continue;
      const k = py * W + px;
      if (hit.z >= depth[k] - 1e-4) continue;
      depth[k] = hit.z; tag[k] = q.letter;
      const tx = Math.min(RES - 1, Math.max(0, Math.floor(hit.u))), ty = Math.min(RES - 1, Math.max(0, Math.floor(hit.v)));
      const si = (ty * RES + tx) * 4;
      let rr = img.pixels[si] * sh, gg = img.pixels[si + 1] * sh, bb = img.pixels[si + 2] * sh;
      const gi = (ty * RES + tx) * 4;
      const ga = TEX[1].pixels[gi + 3] / 255;
      if (ga > 0) { const e = EMISSIVE * ga; rr += TEX[1].pixels[gi] * e; gg += TEX[1].pixels[gi + 1] * e; bb += TEX[1].pixels[gi + 2] * e; }
      color[k * 4] = Math.min(255, rr); color[k * 4 + 1] = Math.min(255, gg); color[k * 4 + 2] = Math.min(255, bb); color[k * 4 + 3] = 255;
    }
  }
  return { W, H, color, depth, tag, uMin, uMax, vMin, vMax, r, u, f };
}

// ------------------------------------------------------------------- views ---
const VIEWS = {
  front: { dir: [0, 0, 1], up: [0, 1, 0], label: 'FRONT  (camera at -Z, looking +Z; image right = -X, up = +Y : you are face to face with the slime)' },
  side: { dir: [-1, 0, 0], up: [0, 1, 0], label: 'SIDE   (camera at +X, looking -X; image right = -Z, up = +Y : nose on the right)' },
  top: { dir: [0, -1, 0], up: [0, 0, -1], label: 'TOP    (camera above, looking -Y; image right = +X, up = -Z : the face is at the top of the map)' },
  q34: { dir: [-0.62, -0.34, 1], up: [0, 1, 0], label: '3/4    (camera front-right-above)' },
};
const rendered = {};
for (const [k, v] of Object.entries(VIEWS)) rendered[k] = renderView(v.dir, v.up);

function writePNG(file, w, h, buf) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, png.encode(w, h, buf)); }
for (const k of ['front', 'side', 'q34']) {
  const R = rendered[k];
  writePNG(path.join(ROOT, 'docs', 'preview_' + (k === 'q34' ? '34' : k) + '.png'), R.W, R.H, R.color);
}

// --- atlas preview: base 4x + tile boundaries, then the glow layer composited over it ----
(function atlasPreview() {
  const base = TEX[0], glow = TEX[1];
  const Z = ATLAS_ZOOM, W = RES * Z, H = RES * Z, DIV = 8;
  const outW = W, outH = H * 2 + DIV;
  const buf = Buffer.alloc(outW * outH * 4);
  for (let i = 0; i < outW * outH; i++) { buf[i * 4] = 20; buf[i * 4 + 1] = 26; buf[i * 4 + 2] = 32; buf[i * 4 + 3] = 255; }
  const put = (x, y, r, g, b, a = 1) => {
    if (x < 0 || y < 0 || x >= outW || y >= outH) return;
    const i = (y * outW + x) * 4;
    buf[i] = Math.round(buf[i] * (1 - a) + r * a); buf[i + 1] = Math.round(buf[i + 1] * (1 - a) + g * a); buf[i + 2] = Math.round(buf[i + 2] * (1 - a) + b * a);
  };
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    const sx = Math.min(RES - 1, (px / Z) | 0), sy = Math.min(RES - 1, (py / Z) | 0);
    const i = (sy * RES + sx) * 4;
    put(px, py, base.pixels[i], base.pixels[i + 1], base.pixels[i + 2]);
    const ga = glow.pixels[i + 3] / 255;
    if (ga > 0) put(px, py, glow.pixels[i], glow.pixels[i + 1], glow.pixels[i + 2], ga * 0.95);
    const j = i;
    put(px, H + DIV + py, base.pixels[j], base.pixels[j + 1], base.pixels[j + 2]);
  }
  for (const t of tiles) {
    const [x0, y0, x1, y1] = t.rect;
    const px0 = x0 * Z, py0 = y0 * Z, px1 = x1 * Z - 1, py1 = y1 * Z - 1;
    for (let x = px0; x <= px1; x++) { put(x, py0, 0, 255, 255, 0.55); put(x, py1, 0, 255, 255, 0.55); }
    for (let y = py0; y <= py1; y++) { put(px0, y, 0, 255, 255, 0.55); put(px1, y, 0, 255, 255, 0.55); }
  }
  for (let y = H; y < H + DIV; y++) for (let x = 0; x < W; x++) put(x, y, 60, 70, 80);
  writePNG(path.join(ROOT, 'docs', 'preview_atlas.png'), outW, outH, buf);
})();

// ------------------------------------------------------------------- ascii ---
function asciiView(key) {
  const R = rendered[key];
  const cols = Math.round(R.uMax - R.uMin), rows = Math.round(R.vMax - R.vMin);
  const sil = [], acc = [];
  for (let j = 0; j < rows; j++) {
    let s = '', a = '';
    for (let i = 0; i < cols; i++) {
      const px = Math.min(R.W - 1, Math.max(0, Math.round(i * S + S / 2 - 0.5)));
      const py = Math.min(R.H - 1, Math.max(0, Math.round(j * S + S / 2 - 0.5)));
      const t = R.tag[py * R.W + px];
      s += t ? '#' : ' ';
      a += t ? t : ' ';
    }
    sil.push(s); acc.push(a);
  }
  return { R, cols, rows, sil, acc };
}
function printView(key) {
  const { R, cols, rows, sil, acc } = asciiView(key);
  const t0 = VIEWS[key].label;
  const isTop = key === 'top';
  const uName = key === 'front' ? 'x  (+X on the LEFT)' : key === 'side' ? 'z  (front -Z on the RIGHT)' : 'x';
  const vName = isTop ? 'z' : 'y';
  const W = Math.max(t0.length, cols * 2 + 12, 40);
  console.log('  ' + t0);
  console.log('  ' + (isTop ? 'silhouette (1 char = 1 unit)'.padEnd(cols + 2) : '') + '   accent map: ' + 'G gel  A acid  E eye  C crystal  T tooth  M maw/mouth  K core  ? hidden tile');
  for (let j = 0; j < rows; j++) {
    const lo = R.vMax - (j + 1);            // integer lower bound of this unit cell
    const lab = (isTop ? 'z' : 'y') + String(isTop ? -lo : lo).padStart(3);
    console.log('  ' + lab + ' |' + sil[j] + '|   |' + acc[j] + '|');
  }
  // axis ruler for the horizontal axis
  const ticks = new Array(cols).fill('-');
  const labels = new Array(cols + 6).fill(' ');
  const axisVal = u => (key === 'front' || key === 'side') ? -u : u;   // image-right = -X (front) / -Z (side) / +X (top)
  for (let i = 0; i < cols; i++) { const u = R.uMin + i; if (Math.abs(u % 5) < 1e-6) { ticks[i] = '+'; const s2 = String(axisVal(u)); for (let k = 0; k < s2.length; k++) labels[i + k] = s2[k]; } }
  console.log('     ' + ' '.repeat(3) + ' +' + ticks.join('') + '+');
  console.log('     ' + ' '.repeat(3) + '  ' + labels.join('').replace(/\s+$/, '') + '   <- ' + uName + '  (vertical axis = ' + vName + ')');
  console.log('');
}
console.log('');
console.log('================ acid_gel_slime — ASCII preview (1 char = 1 model unit) ================');
console.log('legend: # solid   accent map letters = the material of the surface actually visible from that direction');
console.log('');
printView('front');
printView('side');
printView('top');
// ------------------------------------------------------ measured feature map --
function bboxOf(pred) {
  const q = scene.cubes.filter(pred);
  if (!q.length) return null;
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (const c of q) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], c.from[i]); hi[i] = Math.max(hi[i], c.to[i]); }
  return { lo, hi, mid: lo.map((v, i) => (v + hi[i]) / 2), size: hi.map((v, i) => v - lo[i]), n: q.length };
}
const f1 = v => (Math.round(v * 10) / 10).toString();
function showBox(tag, b) {
  if (!b) { console.log('  ' + tag.padEnd(15) + ' -- absent --'); return; }
  console.log('  ' + tag.padEnd(15) + ` x ${f1(b.lo[0])}..${f1(b.hi[0])}  y ${f1(b.lo[1])}..${f1(b.hi[1])}  z ${f1(b.lo[2])}..${f1(b.hi[2])}   ${b.n} cube(s), size ${f1(b.size[0])}x${f1(b.size[1])}x${f1(b.size[2])}`);
}
(function summary() {
  const all = bboxOf(() => true);
  console.log('================ measured geometry ================');
  console.log(`  bones ${scene.order.length}  cubes ${scene.cubes.length}  faces drawn ${scene.quads.length}  atlas tiles declared ${tiles.length}`);
  showBox('model', all);
  const by = t => byName(t);
  function byName(t) { return bboxOf(c => new RegExp(t, 'i').test(c.bone) || new RegExp(t, 'i').test(c.name)); }
  showBox('dome', by('dome|^L\\d'));
  showBox('skirt', by('skirt'));
  showBox('eyes', by('eye_.*(sclera|iris|spark)$'));
  showBox('eye lid', by('eye_.*lid'));
  showBox('brows', by('brow'));
  showBox('mouth/lip', by('lip'));
  showBox('maw+teeth', by('maw|tooth|fang|tongue'));
  showBox('core gem', by('core'));
  showBox('crystals', by('xtal|crystal'));
  showBox('antennae', by('antenna|bulb|stalk'));
  showBox('knob', by('knob'));
  showBox('lobes/arms', by('lobe|arm'));
  showBox('drips', by('drip'));
  showBox('beads', by('bead'));
  const gaze = by('eye_.*(sclera|iris)$');
  if (gaze && all) {
    console.log(`  eyes: centroid z ${f1(gaze.mid[2])} (front of the model is -Z), eye height ${f1(gaze.size[1])} vs body height ${f1(all.size[1])} = ${(100 * gaze.size[1] / all.size[1]).toFixed(0)}% of the total height`);
    console.log(`  maw/teeth front-most z ${f1(by('maw|tooth|fang|tongue').hi[2])} vs lip front z ${f1((by('lip') || { lo: [0, 0, 0] }).lo[2])}`);
  }
  const fams = {};
  for (const t of tiles) fams[t.family] = (fams[t.family] || 0) + 1;
  console.log('  atlas families: ' + Object.entries(fams).map(([k, v]) => k + 'x' + v).join(' '));
  console.log('  wrote docs/preview_front.png, docs/preview_side.png, docs/preview_34.png (' + rendered.front.W + 'x' + rendered.front.H + ' etc., ' + S + ' px/unit)');
  console.log('  wrote docs/preview_atlas.png (' + (RES * ATLAS_ZOOM) + 'x' + (RES * ATLAS_ZOOM * 2 + 8) + ': top = base atlas 4x + tile boundaries, bottom = glow layer composited)');
  console.log('');
})();
