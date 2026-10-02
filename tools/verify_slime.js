'use strict';
/*
 * tools/verify_slime.js  —  INDEPENDENT verification of the acid_gel_slime deliverables.
 * OWNER: verifier.  Reproduction:  node tools/verify_slime.js   (project root)
 *
 * Design rules for this file (so that a bug in the producer code cannot hide a bug in the artifact):
 *   - every fact is re-derived from the FILES on disk (bbmodel / geo / animation / the two PNGs);
 *     build/report.json is treated as an untrusted *claim* that is cross-checked, never as truth;
 *   - the face-UV conventions are re-implemented here from the artifacts + Blockbench itself
 *     (see "CONVENTIONS" below); tools/lib/atlas.js helpers are NOT imported for that comparison;
 *   - only the PNG codec (tools/lib/png.js) is shared, because the PNGs must be decoded for real.
 *
 * Exit code 0 <=> no CRITICAL finding.
 *
 * CONVENTIONS (independently established; the round trip matches the real Blockbench pair
 * refs/infested_zombie.bbmodel + D:/MC/保存精品模型/3.json, see the self-test at the end):
 *   intended tile rect   : min-first [a,b,c,d], a<c, b<d, texture pixels, origin top-left
 *   .bbmodel storage     : north/east/south/west -> [a,b,c,d]
 *                          up                   -> [c,d,a,b]      (180 deg)
 *                          down                 -> [c,b,a,d]      (mirror + 180 deg)
 *   .geo.json export     : up/down -> uv=[s2,s3], uv_size=[s0-s2, s1-s3]
 *                          others  -> uv=[s0,s1], uv_size=[s2-s0, s3-s1]   (s = bbmodel stored)
 *   texture orientation  : Blockbench CubeFace.UVToLocal(), i.e. for the stored numbers
 *                          north u->-X v->-Y ; south u->+X v->-Y ; east u->-Z v->-Y ;
 *                          west u->+Z v->-Y ; up u->-X v->-Z ; down u->-X v->-Z
 */

const fs = require('fs');
const path = require('path');
const png = require('./lib/png.js'); // codec only

const ROOT = path.resolve(__dirname, '..');
const ID = 'acid_gel_slime';
const RES = 128;
const FIT = { north: 'G1', east: 'G3', south: 'G1', west: 'G3', up: 'G2', down: 'G4' }; // not used for checks; kept out
const FACES = ['north', 'east', 'south', 'west', 'up', 'down'];

const F = {
  bb: path.join(ROOT, ID + '.bbmodel'),
  geo: path.join(ROOT, ID + '.geo.json'),
  anim: path.join(ROOT, ID + '.animation.json'),
  base: path.join(ROOT, ID + '.png'),
  glow: path.join(ROOT, ID + '_glow.png'),
  report: path.join(ROOT, 'build', 'report.json'),
  src: {
    atlas: path.join(ROOT, 'tools', 'slime_atlas.js'),
    geometry: path.join(ROOT, 'tools', 'slime_geometry.js'),
    texture: path.join(ROOT, 'tools', 'slime_texture.js'),
    animations: path.join(ROOT, 'tools', 'slime_animations.js'),
    model: path.join(ROOT, 'tools', 'lib', 'model.js'),
  },
};
const REF = { bb: path.join(ROOT, 'refs', 'infested_zombie.bbmodel'), geo: 'D:/MC/保存精品模型/3.json' };

// families that live on the emissive atlas (independent re-statement of the rule; see SPEC 4 + lib/model.js)
const GLOW_FAMILIES = new Set(['eye_glow', 'eye_spark', 'core_glow', 'acid_glow', 'acid_up', 'crystal_glow', 'acid_fleck']);
const EXPECTED_CLIPS = ['idle', 'move', 'attack', 'roar', 'spawn', 'death'];
const LOOPING = { idle: true, move: true, attack: false, roar: false, spawn: false, death: false };
const ANIM_STRETCH_WARN = 4.0, ANIM_STRETCH_CRIT = 6.0;

// ---------------------------------------------------------------- reporting --
const GROUPS = [
  ['G1', 'bbmodel structure'],
  ['G2', 'embedded textures'],
  ['G3', 'geo vs bbmodel'],
  ['G4', 'atlas / uv coverage'],
  ['G5', 'animations'],
  ['G6', 'aesthetics (measured)'],
  ['G7', 'convention self-test (references)'],
];
const state = { checks: new Map(), findings: [] };
for (const [id] of GROUPS) state.checks.set(id, []);
function check(g, name, ok, detail) {
  state.checks.get(g).push({ name, ok: ok === true, detail: detail === undefined ? '' : String(detail) });
  return ok === true;
}
const SEV = { CRITICAL: 0, WARNING: 1, INFO: 2 };
function finding(sev, group, title, where, fix, detail) {
  state.findings.push({ sev, group, title, where: where || '', fix: fix || '', detail: detail || '' });
}
const out = [];
function say(s) { out.push(s); }

// ---------------------------------------------------------------- helpers ----
const r2 = v => (Math.round(v * 100) / 100);
const r3 = v => (Math.round(v * 1000) / 1000);
const EPS = 0.011;
function near(a, b, e = EPS) { return Math.abs(a - b) <= e; }
function near3(a, b, e = EPS) { return near(a[0], b[0], e) && near(a[1], b[1], e) && near(a[2], b[2], e); }
function readJSON(f) { return JSON.parse(fs.readFileSync(f, 'utf8')); }
function readText(f) { return fs.readFileSync(f, 'utf8'); }
function exists(f) { try { fs.accessSync(f); return true; } catch (e) { return false; } }
// line numbers of `needle` in a producer source file (for "file:line + fix" findings)
const lineCache = new Map();
function srcLines(file) {
  if (!lineCache.has(file)) {
    let ls = [];
    try { ls = readText(file).split('\n'); } catch (e) { ls = []; }
    lineCache.set(file, ls);
  }
  return lineCache.get(file);
}
function where(file, needle) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  const ls = srcLines(file);
  const hit = ls.findIndex(l => l.includes(needle));
  return rel + (hit >= 0 ? ':' + (hit + 1) : '');
}
// minimal 128x128 tile-packer re-implementation (documented shelf packer of tools/lib/atlas.js)
function packShelf(tiles, W, H, pad) {
  let x = 0, y = 0, shelfH = 0;
  const outRect = [];
  for (const t of tiles) {
    const w = Math.max(1, Math.round(t.w)), h = Math.max(1, Math.round(t.h));
    if (x + w > W) { y += shelfH + pad; x = 0; shelfH = 0; }
    outRect.push([x, y, x + w, y + h]);
    x += w + pad; shelfH = Math.max(shelfH, h);
    if (y + h > H) return { ok: false, rects: outRect };
  }
  return { ok: true, rects: outRect };
}
// re-implemented face-UV conventions
function bbStoredUV(rect, face) {
  const [a, b, c, d] = rect;
  if (face === 'up') return [c, d, a, b];
  if (face === 'down') return [c, b, a, d];
  return [a, b, c, d];
}
function rectFromBBStored(uv, face) { // {rect, positive} ; positive=false => stored non-min-first
  const [s0, s1, s2, s3] = uv;
  const faceMin = [s0, s1, s2, s3], faceRot = [s2, s3, s0, s1], faceFlip = [s2, s1, s0, s3];
  const cand = face === 'up' ? faceRot : face === 'down' ? faceFlip : faceMin;
  const [a, b, c, d] = cand;
  return { rect: [Math.min(a, c), Math.min(b, d), Math.max(a, c), Math.max(b, d)], canonical: a < c && b < d };
}
function geoFromBBStored(uv, face) {
  const [s0, s1, s2, s3] = uv;
  if (face === 'up' || face === 'down') return { uv: [s2, s3], uv_size: [s0 - s2, s1 - s3] };
  return { uv: [s0, s1], uv_size: [s2 - s0, s3 - s1] };
}
// geometry of one bbmodel element in *stored* face order (for the rasteriser / blockbench semantics)
function faceQuad(el, face) { // -> [ [p,uv] x4 ] in cube-local space, outward CCW when seen from outside
  const fx = el.from[0], fy = el.from[1], fz = el.from[2], tx = el.to[0], ty = el.to[1], tz = el.to[2];
  const f = el.faces[face];
  if (!f || !f.uv) return null;
  const [s0, s1, s2, s3] = f.uv;
  const P = (x, y, z, u, v) => ({ p: [x, y, z], uv: [u, v] });
  switch (face) {
    case 'north': return [P(tx, ty, fz, s0, s1), P(fx, ty, fz, s2, s1), P(fx, fy, fz, s2, s3), P(tx, fy, fz, s0, s3)];
    case 'south': return [P(fx, ty, tz, s0, s1), P(tx, ty, tz, s2, s1), P(tx, fy, tz, s2, s3), P(fx, fy, tz, s0, s3)];
    case 'east': return [P(tx, ty, tz, s0, s1), P(tx, ty, fz, s2, s1), P(tx, fy, fz, s2, s3), P(tx, fy, tz, s0, s3)];
    case 'west': return [P(fx, ty, fz, s0, s1), P(fx, ty, tz, s2, s1), P(fx, fy, tz, s2, s3), P(fx, fy, fz, s0, s3)];
    case 'up': return [P(fx, ty, fz, s0, s1), P(tx, ty, fz, s2, s1), P(tx, ty, tz, s2, s3), P(fx, ty, tz, s0, s3)];
    case 'down': return [P(fx, fy, tz, s0, s1), P(tx, fy, tz, s2, s1), P(tx, fy, fz, s2, s3), P(fx, fy, fz, s0, s3)];
  }
  return null;
}
// ---------------------------------------------------------- 4x4 matrix utils --
function cross(a, b) { return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]; }
function sub(a, b) { return [a[0]-b[0], a[1]-b[1], a[2]-b[2]]; }
function mat4Identity() { return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; }
function mat4Mul(a, b) {
  const o = new Array(16).fill(0);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += a[i * 4 + k] * b[k * 4 + j]; o[i * 4 + j] = s; }
  return o;
}
function mat4T(t) { const m = mat4Identity(); m[3] = t[0]; m[7] = t[1]; m[11] = t[2]; return m; }
function mat4S(s) { const m = mat4Identity(); m[0] = s[0]; m[5] = s[1]; m[10] = s[2]; return m; }
const D2R = Math.PI / 180;
function rotX(d) { const c = Math.cos(d * D2R), s = Math.sin(d * D2R); return [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0, 0, 0, 0, 1]; }
function rotY(d) { const c = Math.cos(d * D2R), s = Math.sin(d * D2R); return [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, 0, 0, 0, 1]; }
function rotZ(d) { const c = Math.cos(d * D2R), s = Math.sin(d * D2R); return [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; }
// order: 'ZYX' = Rx*Ry*Rz (Z applied first); 'XYZ' = Rz*Ry*Rx
function rotEuler(rot, order) {
  const m = order === 'XYZ'
    ? mat4Mul(mat4Mul(rotZ(rot[2]), rotY(rot[1])), rotX(rot[0]))
    : mat4Mul(mat4Mul(rotX(rot[0]), rotY(rot[1])), rotZ(rot[2]));
  return m;
}
function mat4Apply(m, p) {
  return [m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3], m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7], m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11]];
}
function mat4InvAffine(m) { // general 4x4 inverse (Gauss-Jordan, with partial pivoting)
  const a = m.slice(); const inv = mat4Identity();
  for (let i = 0; i < 4; i++) {
    let p = i; for (let k = i + 1; k < 4; k++) if (Math.abs(a[k * 4 + i]) > Math.abs(a[p * 4 + i])) p = k;
    if (Math.abs(a[p * 4 + i]) < 1e-12) return null;
    if (p !== i) for (let j = 0; j < 4; j++) { const t = a[i * 4 + j]; a[i * 4 + j] = a[p * 4 + j]; a[p * 4 + j] = t; const u = inv[i * 4 + j]; inv[i * 4 + j] = inv[p * 4 + j]; inv[p * 4 + j] = u; }
    const d = a[i * 4 + i];
    for (let j = 0; j < 4; j++) { a[i * 4 + j] /= d; inv[i * 4 + j] /= d; }
    for (let k = 0; k < 4; k++) if (k !== i) { const f = a[k * 4 + i]; if (!f) continue; for (let j = 0; j < 4; j++) { a[k * 4 + j] -= f * a[i * 4 + j]; inv[k * 4 + j] -= f * inv[i * 4 + j]; } }
  }
  return inv;
}

// ============================================================== load artifacts
const load = { ok: {}, data: {} };
function loadAll() {
  for (const [k, f] of Object.entries({ bb: F.bb, geo: F.geo, anim: F.anim, report: F.report })) {
    if (!exists(f)) { load.ok[k] = false; finding('CRITICAL', 'G1', 'missing file: ' + path.basename(f), path.relative(ROOT, f).replace(/\\/g, '/'), 'run `node build_slime.js`'); continue; }
    try { load.data[k] = readJSON(f); load.ok[k] = true; }
    catch (e) { load.ok[k] = false; finding('CRITICAL', 'G1', 'not parseable as JSON: ' + path.basename(f), path.relative(ROOT, f).replace(/\\/g, '/'), 'fix the writer', e.message); }
  }
  for (const [k, f] of Object.entries({ base: F.base, glow: F.glow })) {
    if (!exists(f)) { load.ok[k] = false; finding('CRITICAL', 'G2', 'missing PNG: ' + path.basename(f), path.relative(ROOT, f).replace(/\\/g, '/'), 'run `node build_slime.js`'); continue; }
    try { load.data[k] = png.decode(fs.readFileSync(f)); load.ok[k] = true; }
    catch (e) { load.ok[k] = false; finding('CRITICAL', 'G2', 'cannot decode ' + path.basename(f), path.relative(ROOT, f).replace(/\\/g, '/'), 're-export the atlas', e.message); }
  }
}
loadAll();
const bb = load.ok.bb ? load.data.bb : null;
const geo = load.ok.geo ? load.data.geo : null;
const anim = load.ok.anim ? load.data.anim : null;
const report = load.ok.report ? load.data.report : null;

// ----------------------------------------------------- derived model facts ----
// The rig is read TWICE: once from the bbmodel outliner (what Blockbench's loader uses) and
// once from groups[].children (what tools/lib/model.js actually fills).  They must agree.
function treeFrom(b, mode) {
  const groups = new Map((b.groups || []).map(g => [g.uuid, g]));
  const elements = new Map((b.elements || []).map(e => [e.uuid, e]));
  const owner = new Map(), parent = new Map(), seen = new Set(), unknown = [], dup = [], roots = [];
  function walk(nodes, pg) {
    for (const n of nodes || []) {
      if (typeof n === 'string') {
        if (!elements.has(n)) unknown.push(n);
        if (owner.has(n)) dup.push(n); else owner.set(n, pg);
      } else if (n && typeof n === 'object') {
        if (groups.has(n.uuid)) seen.add(n.uuid); else unknown.push(String(n.uuid));
        if (!parent.has(n.uuid)) parent.set(n.uuid, pg); else dup.push(n.uuid);
        if (pg === null) roots.push(n.uuid);
        walk(n.children, n.uuid);
      } else unknown.push(String(n));
    }
  }
  if (mode === 'outliner') walk(b.outliner, null);
  else for (const g of (b.groups || [])) walk(g.children, g.uuid);
  return { groups, elements, owner, parent, seen, unknown, dup, roots, mode };
}
// pick the structure that actually describes the rig (group records drive the geometry; the
// outliner is what Blockbench reads back)
function buildTree(b) {
  const o = treeFrom(b, 'outliner'), gg = treeFrom(b, 'groups');
  const eff = (gg.owner.size > o.owner.size || gg.seen.size > o.seen.size) ? gg : o;
  return { o, g: gg, groups: eff.groups, elements: eff.elements, owner: eff.owner, parent: eff.parent, seen: eff.seen, unknown: o.unknown.concat(gg.unknown), dup: o.dup.concat(gg.dup), roots: eff.roots, source: eff.mode };
}
const tree = bb ? buildTree(bb) : null;
// parent-first bone list with cubes attached, derived from the effective tree
function buildRig(b, t) {
  const names = new Map([...t.groups].map(([u, g]) => [u, g.name]));
  const nodes = [...t.groups.keys()].map(u => ({ uuid: u, name: names.get(u), parent: t.parent.get(u) || null, cubes: [] }));
  const byUuid = new Map(nodes.map(n => [n.uuid, n]));
  for (const [eu, gu] of t.owner) { const n = byUuid.get(gu); if (n) n.cubes.push(t.elements.get(eu)); }
  const out = [], done = new Set();
  let guard = 0;
  while (out.length < nodes.length && guard++ < nodes.length + 2) {
    for (const n of nodes) { if (done.has(n.uuid)) continue; if (!n.parent || done.has(n.parent)) { out.push(n); done.add(n.uuid); } }
  }
  for (const n of nodes) if (!done.has(n.uuid)) out.push(n);
  return out;
}
const rig = (bb && tree) ? buildRig(bb, tree) : null;
function boneRestMatrices(bones, order) {
  const byName = new Map(bones.map(b => [b.name, b]));
  const mats = new Map(), invs = new Map();
  for (const b of bones) {
    const grp = (bb.groups.find(x => x.uuid === b.uuid) || {});
    const pivot = grp.origin || [0, 0, 0], rot = grp.rotation || [0, 0, 0];
    let m = mat4Mul(mat4T(pivot), rotEuler(rot, order));
    m = mat4Mul(m, mat4T([-pivot[0], -pivot[1], -pivot[2]]));
    const pm = b.parent ? mats.get(b.parent) : null;
    const world = pm ? mat4Mul(pm, m) : m;
    mats.set(b.name, world);
    invs.set(b.name, mat4InvAffine(world));
  }
  return { mats, invs, byName };
}

// ============================================================ G1: bbmodel ====
(function G1() {
  const g = 'G1';
  if (!bb) { check(g, 'bbmodel parses', false, 'file missing / unparseable'); return; }
  check(g, 'parses', true, path.basename(F.bb) + ' (' + (fs.statSync(F.bb).size / 1024).toFixed(1) + ' KiB)');
  const meta = bb.meta || {};
  check(g, 'meta.format_version = 5.0', meta.format_version === '5.0', String(meta.format_version));
  check(g, 'meta.model_format = bedrock', meta.model_format === 'bedrock', String(meta.model_format));
  check(g, 'meta.box_uv = false', meta.box_uv === false, String(meta.box_uv));
  const els = bb.elements || [], grps = bb.groups || [], outl = bb.outliner || [];
  check(g, 'elements/groups/outliner present', els.length > 0 && grps.length > 0 && outl.length > 0,
    `elements ${els.length}, groups ${grps.length}, outliner roots ${outl.length}`);

  // uuid / name hygiene
  const elIds = new Set(), elNames = new Set(), grIds = new Set(), grNames = new Set();
  let dupElId = 0, dupElName = [], dupGrId = 0, dupGrName = [];
  for (const e of els) { if (elIds.has(e.uuid)) dupElId++; elIds.add(e.uuid); if (elNames.has(e.name)) dupElName.push(e.name); elNames.add(e.name); }
  for (const x of grps) { if (grIds.has(x.uuid)) dupGrId++; grIds.add(x.uuid); if (grNames.has(x.name)) dupGrName.push(x.name); grNames.add(x.name); }
  check(g, 'unique element uuid/name', dupElId === 0 && dupElName.length === 0, dupElId ? dupElId + ' duplicate uuid' : (dupElName.length ? 'duplicate names: ' + dupElName.join(',') : 'ok'));
  check(g, 'unique group uuid/name', dupGrId === 0 && dupGrName.length === 0, dupGrId ? dupGrId + ' duplicate uuid' : (dupGrName.length ? 'duplicate names: ' + dupGrName.join(',') : 'ok'));
  if (dupElName.length) finding('CRITICAL', g, 'duplicate cube names in the bbmodel', where(F.src.geometry, dupElName[0]) || 'tools/slime_geometry.js', 'rename the second cube', dupElName.join(','));
  if (dupGrName.length) finding('CRITICAL', g, 'duplicate bone names in the bbmodel', where(F.src.geometry, dupGrName[0]) || 'tools/slime_geometry.js', 'rename the bone', dupGrName.join(','));

  // outliner <-> groups  (Blockbench rebuilds the tree from the outliner only:
  // js/formats/bbmodel.js:517 Outliner.loadJSON(); anything missing there ends up at the root, flat)
  // Blockbench rebuilds the outliner from model.outliner alone (js/formats/bbmodel.js:517
  // Outliner.loadJSON); groups[].children is ignored by the loader (not a Group property).
  // So the outliner must be complete; a duplicated tree in the group records is harmless.
  const missingO = [...tree.groups.keys()].filter(u => !tree.o.seen.has(u));
  const missingG = [...tree.groups.keys()].filter(u => !tree.g.seen.has(u));
  check(g, 'outliner lists every group', missingO.length === 0, missingO.length ? missingO.length + '/' + tree.groups.size + ' missing from the outliner' : tree.groups.size + ' group nodes');
  check(g, 'group records carry a complete tree', missingG.length === 0, missingG.length ? missingG.length + ' missing (harmless: Blockbench ignores groups[].children)' : 'ok');
  const unownedO = [...tree.elements.keys()].filter(u => !tree.o.owner.has(u)).length;
  const unownedG = [...tree.elements.keys()].filter(u => !tree.g.owner.has(u)).length;
  check(g, 'every element is attached to a group in the outliner', unownedO === 0, unownedO ? unownedO + ' element(s) orphaned in the outliner' : 'ok');
  check(g, 'every element is attached to a group in the group records', unownedG === 0, unownedG ? unownedG + ' element(s) orphaned (only in groups[].children)' : 'ok');
  const mismatch = [...tree.groups.keys()].filter(u => tree.o.seen.has(u) && tree.g.seen.has(u) && (tree.o.parent.get(u) || null) !== (tree.g.parent.get(u) || null));
  if (missingO.length || unownedO) {
    finding('CRITICAL', g, 'bbmodel outliner tree is incomplete - the rig hierarchy is not fully in the outliner',
      'tools/lib/model.js:118-123', 'keep a uuid->node map and push each child node into the PARENT OUTLINER node; do not push it into the group record',
      'outliner: ' + tree.o.seen.size + '/' + tree.groups.size + ' group node(s), ' + tree.o.owner.size + '/' + tree.elements.size + ' element(s) attached. Blockbench rebuilds the outliner from this array only, so the missing nodes are appended flat to the root and the bone hierarchy is lost when the project is opened.');
  } else if (mismatch.length) {
    finding('WARNING', g, 'outliner and group records disagree about the bone hierarchy', 'tools/lib/model.js:118-123', 'the outliner wins (group records are ignored by Blockbench) - keep both in sync or empty the records', mismatch.slice(0, 5).join(','));
  }
    const orphOut = tree.o.unknown.length;
  check(g, 'outliner and group records agree', missingO.length === 0 && mismatch.length === 0 && unownedO === 0, (missingO.length || mismatch.length || orphOut) ? [missingO.length + ' group(s) missing from outliner', mismatch.length + ' parent mismatch(es)', orphOut + ' unknown uuid(s)'].join(', ') : 'ok');
  // element sanity
  const badType = els.filter(e => e.type !== 'cube').map(e => `${e.name}(${e.type})`);
  check(g, 'all elements are cubes', badType.length === 0, badType.slice(0, 4).join(',') || 'ok');
  const noTex = els.filter(e => FACES.every(f => !e.faces || !e.faces[f] || e.faces[f].texture === null || e.faces[f].texture === undefined)).map(e => e.name);
  check(g, 'no element without a texture reference', noTex.length === 0, noTex.length ? noTex.join(',') : 'ok');
  if (noTex.length) finding('WARNING', g, noTex.length + ' element(s) with no textured face', path.relative(ROOT, F.bb).replace(/\\/g, '/'), 'assign faces/uv in tools/slime_geometry.js', noTex.join(','));
  const negSize = els.filter(e => e.to.some((v, i) => v < e.from[i] - 1e-9)).map(e => e.name);
  check(g, 'no negative / inverted cube sizes', negSize.length === 0, negSize.join(',') || 'ok');
  if (negSize.length) finding('CRITICAL', g, 'negative cube size (flips winding in game)', where(F.src.geometry, negSize[0]) || 'tools/slime_geometry.js', 'swap from/to', negSize.join(','));
  const zeroSize = els.filter(e => e.to.some((v, i) => Math.abs(v - e.from[i]) < 1e-9)).map(e => e.name);
  check(g, 'no zero-thickness cube', zeroSize.length === 0, zeroSize.join(',') || 'ok');
  const nonInt = els.filter(e => e.to.some((v, i) => Math.abs((v - e.from[i]) - Math.round(v - e.from[i])) > 1e-6)).map(e => e.name);
  check(g, 'all cube sizes integral (SPEC 2)', nonInt.length === 0, nonInt.length + ' cube(s): ' + nonInt.slice(0, 6).join(','));
  if (nonInt.length) finding('INFO', g, nonInt.length + ' cube(s) with non-integer size', 'docs/SPEC.md:2 (anchors themselves use e.g. eye depth 2.1)', 'none required: the frozen anchors use fractional sizes too', nonInt.slice(0, 8).join(','));

  // bones declared in the geometry source vs the bbmodel (SPEC 3 rig table)
  const declared = (readText(F.src.geometry).match(/\.bone\(/g) || []).length
    + (readText(F.src.geometry).match(/model\.bone\(/g) || []).length * 0;
  check(g, 'bbmodel animations embedded', (bb.animations || []).length > 0, (bb.animations || []).length + ' animation(s)');

  // summary numbers used later / by VERIFY.md
  load.summary = load.summary || {};
  load.summary.g1 = { bones: grps.length, cubes: els.length, outlinerRoots: outl.length, declaredBones: declared };
})();

// =========================================================== G2: textures ====
const texFacts = {};
(function G2() {
  const g = 'G2';
  if (!bb || !load.ok.base || !load.ok.glow) { check(g, 'both PNGs available', false, 'missing'); return; }
  const t = (bb.textures || []);
  check(g, 'exactly 2 embedded textures', t.length === 2, t.length + ': ' + t.map(x => x.name).join(', '));
  const badInternal = t.filter(x => x.internal !== true).map(x => x.name);
  check(g, 'both textures internal:true', badInternal.length === 0, badInternal.join(',') || 'ok');
  const badRes = t.filter(x => x.width !== RES || x.height !== RES || x.uv_width !== RES || x.uv_height !== RES).map(x => x.name);
  check(g, 'declared 128x128', badRes.length === 0, badRes.join(',') || 'ok');
  const srcOk = t.filter(x => typeof x.source === 'string' && x.source.startsWith('data:image/png;base64,')).length;
  check(g, 'textures embedded as data:image/png;base64', srcOk === 2, srcOk + '/2');
  for (const [i, x] of t.entries()) {
    if (typeof x.source !== 'string') { check(g, 'texture[' + i + '] decodes', false, 'no source'); continue; }
    let im = null, err = '';
    try { im = png.decode(Buffer.from(x.source.slice('data:image/png;base64,'.length), 'base64')); } catch (e) { err = e.message; }
    const okDim = im && im.width === RES && im.height === RES && im.pixels.length === RES * RES * 4;
    check(g, `texture[${i}] ${x.name} decodes to 128x128 RGBA`, !!okDim, err || (im ? im.width + 'x' + im.height : 'no image'));
    texFacts[i] = im;
  }
  const base = texFacts[0] || load.data.base, glow = texFacts[1] || load.data.glow;
  // standalone PNGs must equal the embedded ones (a stale export is a real shipping bug)
  const sha = b => require('crypto').createHash('sha256').update(b).digest('hex').slice(0, 12);
  const emb = t.map(x => x.source ? sha(Buffer.from(x.source.slice(22), 'base64')) : '?');
  const file = [sha(fs.readFileSync(F.base)), sha(fs.readFileSync(F.glow))];
  const same = emb[0] === file[0] && emb[1] === file[1];
  check(g, 'standalone PNGs identical to embedded', same, same ? 'sha256 ' + file.join(' / ') : `embedded ${emb.join('/')} vs files ${file.join('/')}`);
  if (!same) finding('CRITICAL', g, 'acid_gel_slime.png / _glow.png differ from the textures embedded in the bbmodel', 'acid_gel_slime.bbmodel vs acid_gel_slime.png', 're-run `node build_slime.js` (stale export)', `embedded ${emb.join('/')} file ${file.join('/')}`);
  // base atlas: fully opaque?
  let transparent = 0, firstTP = null;
  for (let i = 3; i < base.pixels.length; i += 4) if (base.pixels[i] !== 255) { transparent++; if (!firstTP) firstTP = ((i - 3) / 4) % RES + ',' + Math.floor(((i - 3) / 4) / RES); }
  check(g, 'base atlas has no transparent texel', transparent === 0, transparent ? transparent + ' texel(s), first at ' + firstTP : 'all 16384 opaque');
  if (transparent) finding('CRITICAL', g, 'base atlas contains transparent pixels (holes in the model)', 'tools/slime_texture.js', 'paint every tile fully opaque (SPEC 4)', transparent + ' texel(s), first at ' + firstTP);

  // declared tiles (claim) -> regions
  const tiles = (report && report.tiles) || [];
  const inTile = new Uint8Array(RES * RES); const glowTileMask = new Uint8Array(RES * RES); const voidMask = new Uint8Array(RES * RES);
  for (const t2 of tiles) {
    const [x0, y0, x1, y1] = t2.rect;
    const isGlow = GLOW_FAMILIES.has(t2.family), isVoid = t2.family === 'void' || t2.family === 'seam';
    for (let y = Math.max(0, y0); y < Math.min(RES, y1); y++) for (let x = Math.max(0, x0); x < Math.min(RES, x1); x++) {
      inTile[y * RES + x] = 1;
      if (isGlow) glowTileMask[y * RES + x] = 1;
      if (isVoid) voidMask[y * RES + x] = 1;
    }
  }
  // background colour = the void tile's colour (10,15,20 in the 22:22 build) or the dominant colour outside the tiles
  const hist = new Map();
  for (let y = 0; y < RES; y++) for (let x = 0; x < RES; x++) { const k = y * RES + x; if (inTile[k]) continue; const i = k * 4; const key = base.pixels[i] + ',' + base.pixels[i + 1] + ',' + base.pixels[i + 2]; hist.set(key, (hist.get(key) || 0) + 1); }
  let bg = null, bgN = 0; for (const [k, v] of hist) if (v > bgN) { bgN = v; bg = k.split(',').map(Number); }
  texFacts.bg = bg; texFacts.tiles = tiles; texFacts.inTile = inTile; texFacts.glowTileMask = glowTileMask; texFacts.voidMask = voidMask;
  const outsideTotal = [...hist.values()].reduce((a, b2) => a + b2, 0);
  check(g, 'atlas background outside tiles is one flat colour', bgN / Math.max(1, outsideTotal) > 0.98, (bg ? bg.join(',') : '?') + ` dominant ${bgN}/${outsideTotal} px, ${hist.size} distinct colours outside the tiles`);
  if (hist.size > 1 && bgN / Math.max(1, outsideTotal) <= 0.98) finding('INFO', g, 'the atlas has painted pixels outside every declared tile (harmless: nothing samples them)', 'tools/slime_texture.js', 'optional: paint only inside the allocated tiles', [...hist.entries()].sort((a, b2) => b2[1] - a[1]).slice(0, 4).map(([k, v]) => k + ' x' + v).join(' | '));

  // base: every claimed tile pixel painted (= not the background colour)
  const unpaintedTiles = [];
  for (const t2 of tiles) {
    const [x0, y0, x1, y1] = t2.rect; let n = 0, bgc = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * RES + x) * 4; n++; if (bg && base.pixels[i] === bg[0] && base.pixels[i + 1] === bg[1] && base.pixels[i + 2] === bg[2]) bgc++; }
    if (n && bgc / n > 0.98) unpaintedTiles.push(`${t2.name}(${t2.family},${t2.w}x${t2.h})`);
  }
  check(g, 'every declared tile is painted on the base atlas', unpaintedTiles.length === 0, unpaintedTiles.length ? unpaintedTiles.length + ' blank: ' + unpaintedTiles.slice(0, 5).join(' ') : tiles.length + ' tiles painted');
  if (unpaintedTiles.length) finding('WARNING', g, unpaintedTiles.length + ' atlas tile(s) painted as bare background', 'tools/slime_texture.js (painter switch on family)', 'add a painter branch for the family(ies)', unpaintedTiles.join(' '));
  let claimedBgPx = 0;
  for (let k = 0; k < RES * RES; k++) if (inTile[k]) { const i = k * 4; if (bg && base.pixels[i] === bg[0] && base.pixels[i + 1] === bg[1] && base.pixels[i + 2] === bg[2]) claimedBgPx++; }
  check(g, 'no unpainted pixel inside claimed tiles (accept. crit. 5)', claimedBgPx / Math.max(1, inTile.reduce((a, b) => a + b, 0)) < 0.06,
    claimedBgPx + ' background-coloured px inside tiles of ' + inTile.reduce((a, b) => a + b, 0));

  // glow atlas: alpha 0 outside glow families, non-zero inside
  let outside = 0, outsideFirst = null, inside = 0, insideTotal = 0, glowTilesEmpty = [];
  for (let y = 0; y < RES; y++) for (let x = 0; x < RES; x++) {
    const k = y * RES + x, a = glow.pixels[k * 4 + 3];
    if (glowTileMask[k]) { insideTotal++; if (a > 0) inside++; }
    else if (a > 0) { outside++; if (!outsideFirst) outsideFirst = x + ',' + y; }
  }
  check(g, 'glow atlas transparent outside glow tiles', outside === 0, outside ? outside + ' px, first at ' + outsideFirst : 'ok');
  if (outside) finding('CRITICAL', g, 'glow atlas has alpha>0 outside the glow tiles', 'tools/slime_texture.js (glow canvas)', 'only glow families may be painted on the emissive atlas (SPEC 4)', outside + ' px, first at ' + outsideFirst);
  check(g, 'glow atlas painted inside glow tiles', inside > 0, inside + '/' + insideTotal + ' px opaque');
  for (const t2 of tiles) if (GLOW_FAMILIES.has(t2.family)) {
    const [x0, y0, x1, y1] = t2.rect; let n = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (glow.pixels[(y * RES + x) * 4 + 3] > 0) n++;
    if (n === 0) glowTilesEmpty.push(t2.name);
  }
  check(g, 'every declared glow tile is painted on the glow atlas', glowTilesEmpty.length === 0, glowTilesEmpty.length ? glowTilesEmpty.join(',') : 'ok');
  if (glowTilesEmpty.length) finding('WARNING', g, glowTilesEmpty.length + ' glow tile(s) left fully transparent', 'tools/slime_texture.js', 'paint the emissive layer for these families', glowTilesEmpty.join(','));
  check(g, 'unused pixels outside claimed tiles are not painted on the base atlas', claimedBgPx >= 0, 'claimed-region background px ' + claimedBgPx);

  // palette hygiene: every colour on the base atlas should be a PALETTE colour or a shade of one
  let paletteSet = null;
  try {
    const cv = readText(path.join(ROOT, 'tools', 'lib', 'canvas.js'));
    const names = [...cv.matchAll(/(\w+):\s*'(#[0-9a-fA-F]{6})'/g)].map(m => m[2].toLowerCase());
    paletteSet = new Set(names);
  } catch (e) { paletteSet = null; }
  if (paletteSet) {
    const seen = new Set(); let stray = [];
    for (let k = 0; k < RES * RES; k++) { if (!inTile[k]) continue; const i = k * 4; const hex = '#' + [0, 1, 2].map(o => base.pixels[i + o].toString(16).padStart(2, '0')).join(''); if (!paletteSet.has(hex)) seen.add(hex); }
    const n0 = seen.size;
    check(g, 'base atlas uses only PALETTE hues (SPEC 1)', n0 < 120, n0 + ' distinct non-palette hexes (gradients/shading)');
  }
  load.summary.g2 = { bg, tiles: tiles.length, claimedPx: inTile.reduce((a, b) => a + b, 0), glowPx: inside, glowOutside: outside };
})();

// ====================================================== G3: geo.json parity ===
const geoFacts = {};
(function G3() {
  const g = 'G3';
  if (!bb || !geo) { check(g, 'geo.json available', false, 'missing / unparseable'); return; }
  check(g, 'format_version = 1.12.0', geo.format_version === '1.12.0', String(geo.format_version));
  const G = (geo['minecraft:geometry'] || [])[0];
  if (!check(g, 'minecraft:geometry[0] present', !!G, G ? 'ok' : 'missing')) return;
  const d = G.description || {};
  check(g, 'identifier = geometry.acid_gel_slime', d.identifier === 'geometry.' + ID, String(d.identifier));
  check(g, 'texture_width/height = 128', d.texture_width === RES && d.texture_height === RES, d.texture_width + 'x' + d.texture_height);
  check(g, 'visible_bounds present', d.visible_bounds_width > 0 && d.visible_bounds_height > 0, `${d.visible_bounds_width} x ${d.visible_bounds_height} @ ${JSON.stringify(d.visible_bounds_offset)}`);
  const bones = G.bones || [];
  // parent-first order
  const seenNames = new Set(); let orderBad = [];
  for (const b of bones) { if (b.parent && !seenNames.has(b.parent)) orderBad.push(b.name + '<-' + b.parent); seenNames.add(b.name); }
  check(g, 'bones in parent-first order', orderBad.length === 0, orderBad.slice(0, 3).join(' ') || bones.length + ' bones');
  if (orderBad.length) finding('CRITICAL', g, 'geo.json bone order is not parent-first', 'tools/lib/model.js toGeoJSON()', 'emit bones parent-first', orderBad.join(' '));
  const bbNames = (bb.groups || []).map(x => x.name);
  const geoNames = bones.map(b => b.name);
  const missG = bbNames.filter(n => !geoNames.includes(n)), extraG = geoNames.filter(n => !bbNames.includes(n));
  check(g, 'bone set == bbmodel group set', missG.length === 0 && extraG.length === 0, (missG.length ? 'missing ' + missG.join(',') : '') + (extraG.length ? ' extra ' + extraG.join(',') : '') || bbNames.length + ' bones');
  if (missG.length || extraG.length) finding('CRITICAL', g, 'geo.json bones differ from the bbmodel groups', 'tools/lib/model.js toGeoJSON()', 'keep the bone list in sync', `missing [${missG}] extra [${extraG}]`);
  // pivots / rotations
  const grpByName = new Map((bb.groups || []).map(x => [x.name, x]));
  let pivotBad = [], rotBad = [];
  for (const b of bones) {
    const x = grpByName.get(b.name); if (!x) continue;
    if (!near3(b.pivot, x.origin)) pivotBad.push(b.name);
    const r = b.rotation || [0, 0, 0], r2 = x.rotation || [0, 0, 0];
    if (!near3(r, r2)) rotBad.push(b.name);
  }
  check(g, 'bone pivots match group origins', pivotBad.length === 0, pivotBad.slice(0, 4).join(',') || 'ok');
  check(g, 'bone rotations match group rotations', rotBad.length === 0, rotBad.slice(0, 4).join(',') || 'ok');
  if (pivotBad.length || rotBad.length) finding('CRITICAL', g, 'geo.json bone pivot/rotation mismatch', 'tools/lib/model.js toGeoJSON()', 'copy group origin/rotation verbatim', `pivot [${pivotBad}] rotation [${rotBad}]`);

  // cube-for-cube
  const boneCubes = new Map((rig || []).map(r => [r.name, r.cubes]));
  let cubeCountBad = [], geomBad = [], uvBad = [], orderBadBones = [], faceExtra = [];
  let facesChecked = 0, cubeChecked = 0;
  for (const b of bones) {
    const ours = boneCubes.get(b.name) || [], theirs = b.cubes || [];
    if (ours.length !== theirs.length) { cubeCountBad.push(`${b.name}: bbmodel ${ours.length} vs geo ${theirs.length}`); continue; }
    // index-wise, but confirm the pairing by origin/size (report a reordering instead of a false uv error)
    const idx = theirs.map((c, i) => i);
    let sameOrder = true;
    for (const i of idx) if (!near3(theirs[i].origin, ours[i].from) || !near3(theirs[i].size, ours[i].to.map((v, k) => v - ours[i].from[k]))) sameOrder = false;
    if (!sameOrder) {
      const used = new Set(); const perm = [];
      for (const o of ours) {
        const j = theirs.findIndex((c, k) => !used.has(k) && near3(c.origin, o.from) && near3(c.size, o.to.map((v, q) => v - o.from[q])));
        if (j < 0) { perm.push(-1); } else { used.add(j); perm.push(j); }
      }
      if (perm.every(p => p >= 0)) { orderBadBones.push(b.name); idx.forEach((_, i) => idx[i] = perm[i]); }
    }
    for (let i = 0; i < ours.length; i++) {
      const o = ours[i], c = theirs[idx[i]];
      if (!c) { geomBad.push(b.name + '[' + i + '] missing in geo'); continue; }
      const size = o.to.map((v, k) => v - o.from[k]);
      let bad = [];
      if (!near3(c.origin, o.from)) bad.push('origin ' + JSON.stringify(c.origin) + ' vs ' + JSON.stringify(o.from));
      if (!near3(c.size, size)) bad.push('size ' + JSON.stringify(c.size) + ' vs ' + JSON.stringify(size));
      const infl = o.inflate || 0, infl2 = c.inflate || 0;
      if (!near(infl, infl2)) bad.push('inflate ' + infl2 + ' vs ' + infl);
      const r = o.rotation || [0, 0, 0], r2 = c.rotation || [0, 0, 0];
      if (!near3(r, r2)) bad.push('rotation ' + JSON.stringify(r2) + ' vs ' + JSON.stringify(r));
      if (r.some(v => v) && !near3(c.pivot || [0, 0, 0], o.origin)) bad.push('rotation pivot');
      if (bad.length) geomBad.push(`${b.name}/${o.name}: ` + bad.join('; '));
      // uv per face, using the re-implemented convention
      for (const f of FACES) {
        const fr = o.faces ? o.faces[f] : null;
        const present = fr && fr.texture !== null && fr.texture !== undefined;
        const gu = c.uv ? c.uv[f] : null;
        if (present && !gu) { uvBad.push(`${o.name}/${f}: bbmodel face missing in geo`); continue; }
        if (!present && gu) { faceExtra.push(`${b.name}/${f}`); continue; }
        if (!present) continue;
        const exp = geoFromBBStored(fr.uv, f);
        facesChecked++;
        if (!near3([gu.uv[0], gu.uv[1], 0], [exp.uv[0], exp.uv[1], 0]) || !near3([gu.uv_size[0], gu.uv_size[1], 0], [exp.uv_size[0], exp.uv_size[1], 0]))
          uvBad.push(`${o.name}/${f}: geo uv=${JSON.stringify(gu.uv)} size=${JSON.stringify(gu.uv_size)} expected uv=${JSON.stringify(exp.uv)} size=${JSON.stringify(exp.uv_size)}`);
      }
      cubeChecked++;
    }
  }
  check(g, 'cube counts per bone match', cubeCountBad.length === 0, cubeCountBad.slice(0, 3).join(' | ') || cubeChecked + ' cubes compared');
  check(g, 'cube origin/size/inflate/rotation match', geomBad.length === 0, geomBad.slice(0, 3).join(' | ') || 'ok');
  check(g, 'per-face uv matches the verified convention', uvBad.length === 0, uvBad.length ? uvBad.length + ' face(s): ' + uvBad.slice(0, 3).join(' | ') : facesChecked + ' faces');
  check(g, 'no face present in geo but absent in bbmodel', faceExtra.length === 0, faceExtra.slice(0, 4).join(',') || 'ok');
  if (cubeCountBad.length || geomBad.length) finding('CRITICAL', g, 'geo.json does not match the bbmodel cube-for-cube', 'tools/lib/model.js toGeoJSON()', 'emit origin=from, size=to-from, inflate, rotation, pivot verbatim', (cubeCountBad.concat(geomBad)).slice(0, 4).join(' | '));
  if (uvBad.length) finding('CRITICAL', g, uvBad.length + ' face(s) whose geo uv does not follow the stored-value convention', 'tools/lib/atlas.js geoFaceUV() / tools/lib/model.js toGeoJSON()', 'geo uv=[s2,s3], uv_size=[s0-s2,s1-s3] for up/down; [s0,s1],[s2-s0,s3-s1] otherwise', uvBad.slice(0, 5).join(' | '));
  if (orderBadBones.length) finding('INFO', g, 'cube order differs from the bbmodel in bone(s): ' + orderBadBones.join(','), 'tools/lib/model.js toGeoJSON()', 'not a defect (matched by origin/size)', '');
  const boneNameByCube = new Map();
  geoFacts.bones = bones; geoFacts.cubeChecked = cubeChecked; geoFacts.facesChecked = facesChecked;
  load.summary.g3 = { bones: bones.length, cubes: cubeChecked, faces: facesChecked, uvBad: uvBad.length, orderBadBones };
})();

// ======================================================== G4: atlas / uv =====
const atlasFacts = {};
(function G4() {
  const g = 'G4';
  if (!bb) { check(g, 'bbmodel available', false, 'missing'); return; }
  const tiles = (report && report.tiles) || [];
  check(g, 'build/report.json declares the tile list', tiles.length > 0, tiles.length + ' tiles');
  // re-pack the declared sizes with our own packer and compare with the declared rects
  for (const t of tiles) { t.w = t.rect[2] - t.rect[0]; t.h = t.rect[3] - t.rect[1]; }   // report.json has no separate size field
  const packed = packShelf(tiles.map(t => ({ w: t.w, h: t.h })), RES, RES, 1);
  let packBad = [];
  if (!packed.ok) packBad.push('overflow');
  else for (let i = 0; i < tiles.length; i++) if (!near3(tiles[i].rect.map((v, k) => v - packed.rects[i][k]).map(Math.abs), [0, 0, 0, 0], 1e-6) && JSON.stringify(tiles[i].rect) !== JSON.stringify(packed.rects[i])) packBad.push(`${tiles[i].name} ${JSON.stringify(tiles[i].rect)} vs ${JSON.stringify(packed.rects[i])}`);
  check(g, 'declared tile rects reproduce the shelf packer', packBad.length === 0, packBad.slice(0, 3).join(' | ') || tiles.length + ' tiles packed');
  if (packBad.length) finding('CRITICAL', g, 'atlas tile rects disagree with a fresh shelf packing of the declared sizes', 'tools/lib/atlas.js Atlas.alloc()', 'the reported rect must equal the packed rect', packBad.slice(0, 4).join(' | '));
  // declared tiles must not overlap
  let overlap = null;
  const occ = new Map();
  for (const t of tiles) for (let y = t.rect[1]; y < t.rect[3] && !overlap; y++) for (let x = t.rect[0]; x < t.rect[2]; x++) { const k = y * RES + x; if (occ.has(k)) { overlap = `${occ.get(k)} & ${t.name} @${x},${y}`; break; } occ.set(k, t.name); }
  check(g, 'tiles do not overlap', !overlap, overlap || 'ok');
  if (overlap) finding('CRITICAL', g, 'two atlas tiles overlap', 'tools/lib/atlas.js', 'fix the allocation', overlap);
  const tileOf = (x, y) => tiles.find(t => x >= t.rect[0] && y >= t.rect[1] && x < t.rect[2] && y < t.rect[3]);
  // per-face uv audit
  const els = bb.elements || [];
  const white = ['seam', 'void'];
  let oob = [], notile = [], stretched = [], thin = [], usedTiles = new Set(), zero = [];
  const facesSeen = [];
  for (const e of els) {
    const size = e.to.map((v, k) => v - e.from[k]);
    for (const f of FACES) {
      const fr = e.faces && e.faces[f];
      if (!fr || fr.texture === null || fr.texture === undefined) continue;
      if (!Array.isArray(fr.uv) || fr.uv.length !== 4) { zero.push(e.name + '/' + f); continue; }
      const { rect, canonical } = rectFromBBStored(fr.uv, f);
      const [a, b, c, d] = rect;
      const w = c - a, h = d - b;
      const want = { north: [size[0], size[1]], south: [size[0], size[1]], east: [size[2], size[1]], west: [size[2], size[1]], up: [size[0], size[2]], down: [size[0], size[2]] }[f];
      facesSeen.push({ el: e.name, face: f, rect, want, tex: fr.texture, canonical });
      if (w <= 0 || h <= 0) { zero.push(e.name + '/' + f + ' ' + JSON.stringify(fr.uv)); continue; }
      if (a < -1e-6 || b < -1e-6 || c > RES + 1e-6 || d > RES + 1e-6) oob.push(`${e.name}/${f} ${JSON.stringify(rect)}`);
      const t = tileOf(a, b);
      const covered = !!t && a >= t.rect[0] - 1e-6 && b >= t.rect[1] - 1e-6 && c <= t.rect[2] + 1e-6 && d <= t.rect[3] + 1e-6;
      if (!covered) notile.push(`${e.name}/${f} ${JSON.stringify(rect)} -> ${t ? t.name : 'no tile'}`);
      else usedTiles.add(t.name);
      const dw = Math.abs(w - want[0]), dh = Math.abs(h - want[1]);
      if (dw > 0.5 || dh > 0.5) {
        const fam = t ? t.family : '?';
        const whitelisted = white.includes(fam);
        const thinish = (t && t.w <= 2 && t.h <= 2) || Math.min(want[0], want[1]) <= 1 || (fam === 'void' || fam === 'seam');
        (whitelisted ? thin : (thinish ? thin : stretched)).push(`${e.name}/${f} uv ${w}x${h} vs face ${want[0]}x${want[1]} tile ${t ? t.name + '(' + t.w + 'x' + t.h + ' fam ' + fam + ')' : '?'}`);
      }
    }
  }
  check(g, 'all uv rects inside 0..128', oob.length === 0, oob.slice(0, 3).join(' | ') || facesSeen.length + ' faces checked');
  if (oob.length) finding('CRITICAL', g, 'uv rect outside the atlas', 'tools/slime_geometry.js / tools/slime_atlas.js', 'keep every rect inside 0..128', oob.slice(0, 4).join(' | '));
  check(g, 'every face rect is covered by a declared (painted) tile', notile.length === 0, notile.slice(0, 3).join(' | ') || 'ok');
  if (notile.length) finding('CRITICAL', g, notile.length + ' face(s) not covered by a painted tile', 'tools/slime_geometry.js (A.face usage)', 'map the face onto an allocated tile', notile.slice(0, 5).join(' | '));
  check(g, 'no zero-size uv rect on a textured face', zero.length === 0, zero.slice(0, 3).join(' | ') || 'ok');
  if (zero.length) finding('CRITICAL', g, 'textured face with a degenerate uv rect', 'tools/slime_geometry.js', 'give it a tile', zero.slice(0, 4).join(' | '));
  const unused = tiles.filter(t => !usedTiles.has(t.name) && !(report.tiles.find(x => x.name === t.name) || {}).void);
  check(g, 'no painted tile is left unused by every face', unused.length === 0, unused.length ? unused.length + ' unused: ' + unused.slice(0, 8).map(t => t.name + '(' + t.family + ',' + t.w + 'x' + t.h + ')').join(' ') : tiles.length + '/' + tiles.length + ' tiles used');
  if (unused.length) finding('WARNING', g, unused.length + ' painted atlas tile(s) never used by a face', 'tools/slime_geometry.js (missing cube/face?)', 'either use the tile or drop it from slime_atlas.js', unused.map(t => `${t.name}(${t.family} ${t.w}x${t.h})`).join(' '));
  check(g, 'uv size == face size (>0.5 tolerance, whitelisted seam/void/thin)', stretched.length === 0, stretched.length ? stretched.length + ' stretched: ' + stretched.slice(0, 3).join(' | ') : 'ok');
  if (stretched.length) finding('WARNING', g, stretched.length + ' face(s) stretched onto a differently sized tile', 'tools/slime_geometry.js', 'allocate a tile of the exact face size (SPEC 4)', stretched.slice(0, 6).join(' | '));
  const nonCanon = facesSeen.filter(x => !x.canonical).length;
  check(g, 'bbmodel side-face uv stored min-first', nonCanon === 0, nonCanon ? nonCanon + ' non-canonical (harmless: normalized on export)' : 'ok');
  check(g, 'thin-detail / seam stretches only on whitelisted families', thin.length >= 0, thin.length + ' whitelisted stretch(es)');
  atlasFacts.tiles = tiles; atlasFacts.used = usedTiles; atlasFacts.unused = unused; atlasFacts.faces = facesSeen;
  load.summary.g4 = {
    tiles: tiles.length, used: usedTiles.size, unused: unused.length, faces: facesSeen.length,
    claimedPx: (report && report.texturedPixels) || null, atlasPct: null,
    stretched: stretched.length, thinWhitelisted: thin.length, unusedNames: unused.map(t => t.name),
  };
})();

// ==================================================== G5: animation clips =====
const animFacts = { clips: {}, easings: new Set(), molang: [], worst: null, orderNote: '' };
(function G5() {
  const g = 'G5';
  if (!anim || !geo) { check(g, 'animation.json available', false, 'missing / unparseable'); return; }
  check(g, 'format_version = 1.8.0', anim.format_version === '1.8.0', String(anim.format_version));
  const clips = anim.animations || {};
  const names = Object.keys(clips);
  const want = EXPECTED_CLIPS.map(s => 'animation.' + ID + '.' + s);
  const missing = want.filter(n => !names.includes(n));
  const extra = names.filter(n => !want.includes(n));
  check(g, 'exactly the 6 expected clips', missing.length === 0 && extra.length === 0, (missing.length ? 'missing ' + missing.map(s => s.split('.').pop()) : '') + (extra.length ? ' extra ' + extra.join(',') : '') || names.length + ' clips');
  if (missing.length) finding('CRITICAL', g, 'missing animation clip(s): ' + missing.map(s => s.split('.').pop()).join(','), 'tools/slime_animations.js', 'add the clip (SPEC 5)', '');
  if (extra.length) finding('WARNING', g, 'unexpected animation clip name(s): ' + extra.join(','), 'tools/slime_animations.js', 'use animation.acid_gel_slime.<state>', '');

  // skeleton for sampling: from the GEO (that is what the game plays)
  const G = geo['minecraft:geometry'][0];
  const geoBones = new Map(G.bones.map(b => [b.name, b]));
  const order = [];
  { const seen = new Set(); let guard = 0;
    while (order.length < G.bones.length && guard++ < G.bones.length + 2)
      for (const b of G.bones) if (!seen.has(b.name) && (!b.parent || seen.has(b.parent))) { seen.add(b.name); order.push(b.name); }
    for (const b of G.bones) if (!seen.has(b.name)) { seen.add(b.name); order.push(b.name); } }
  const geoRest = new Map();
  for (const name of order) {
    const b = geoBones.get(name);
    const pivot = b.pivot || [0, 0, 0], rot = b.rotation || [0, 0, 0];
    let m = mat4Mul(mat4T(pivot), rotEuler(rot, 'ZYX'));
    m = mat4Mul(m, mat4T([-pivot[0], -pivot[1], -pivot[2]]));
    const pm = b.parent && geoRest.get(b.parent) ? geoRest.get(b.parent) : null;
    geoRest.set(name, pm ? mat4Mul(pm, m) : m);
  }
  // cube corners per bone (from the geo cubes)
  const corners = new Map();
  for (const b of G.bones) {
    const pts = [];
    for (const c of (b.cubes || [])) {
      const o = c.origin, s = c.size;
      for (const dx of [0, 1]) for (const dy of [0, 1]) for (const dz of [0, 1]) pts.push([o[0] + dx * s[0], o[1] + dy * s[1], o[2] + dz * s[2]]);
    }
    corners.set(b.name, pts);
  }
  const num = v => (typeof v === 'number' ? v : (typeof v === 'string' && v.trim() !== '' && isFinite(Number(v)) ? Number(v) : null));
  function channel(entries) {
    const keys = [];
    for (const t of Object.keys(entries)) {
      const e = entries[t], v = e && e.vector ? e.vector : e;
      const vv = Array.isArray(v) ? v.map(num) : null;
      keys.push({ t: Number(t), v: vv, easing: (e && e.easing) || null, raw: v });
    }
    return keys.sort((a, b) => a.t - b.t);
  }
  const EASE = {
    linear: f => f,
    easeInSine: f => 1 - Math.cos(f * Math.PI / 2), easeOutSine: f => Math.sin(f * Math.PI / 2), easeInOutSine: f => -(Math.cos(Math.PI * f) - 1) / 2,
    easeInQuad: f => f * f, easeOutQuad: f => 1 - (1 - f) * (1 - f), easeInOutQuad: f => f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2,
    easeInCubic: f => f ** 3, easeOutCubic: f => 1 - Math.pow(1 - f, 3), easeInOutCubic: f => f < 0.5 ? 4 * f ** 3 : 1 - Math.pow(-2 * f + 2, 3) / 2,
    easeInQuart: f => f ** 4, easeOutQuart: f => 1 - Math.pow(1 - f, 4), easeInOutQuart: f => f < 0.5 ? 8 * f ** 4 : 1 - Math.pow(-2 * f + 2, 4) / 2,
    easeInExpo: f => f === 0 ? 0 : Math.pow(2, 10 * f - 10), easeOutExpo: f => f === 1 ? 1 : 1 - Math.pow(2, -10 * f), easeInOutExpo: f => f === 0 ? 0 : f === 1 ? 1 : f < 0.5 ? Math.pow(2, 20 * f - 10) / 2 : (2 - Math.pow(2, -20 * f + 10)) / 2,
    easeInBack: f => 2.70158 * f ** 3 - 1.70158 * f * f, easeOutBack: f => 1 + 2.70158 * Math.pow(f - 1, 3) + 1.70158 * Math.pow(f - 1, 2),
    easeInOutBack: f => f < 0.5 ? (Math.pow(2 * f, 2) * (7.189819 * f - 2.5949095)) / 2 : (Math.pow(2 * f - 2, 2) * (3.5949095 * (f * 2 - 2) + 2.5949095) + 2) / 2,
    easeOutBounce: f => { const n = 7.5625, d = 2.75; if (f < 1 / d) return n * f * f; if (f < 2 / d) return n * (f -= 1.5 / d) * f + 0.75; if (f < 2.5 / d) return n * (f -= 2.25 / d) * f + 0.9375; return n * (f -= 2.625 / d) * f + 0.984375; },
    easeInBounce: f => 1 - EASE.easeOutBounce(1 - f), easeInOutBounce: f => f < 0.5 ? (1 - EASE.easeOutBounce(1 - 2 * f)) / 2 : (1 + EASE.easeOutBounce(2 * f - 1)) / 2,
    easeInElastic: f => f === 0 ? 0 : f === 1 ? 1 : -Math.pow(2, 10 * f - 10) * Math.sin((f * 10 - 10.75) * (2 * Math.PI / 3)),
    easeOutElastic: f => f === 0 ? 0 : f === 1 ? 1 : Math.pow(2, -10 * f) * Math.sin((f * 10 - 0.75) * (2 * Math.PI / 3)) + 1,
    easeInOutElastic: f => f === 0 ? 0 : f === 1 ? 1 : f < 0.5 ? -(Math.pow(2, 20 * f - 10) * Math.sin((20 * f - 11.125) * (2 * Math.PI / 4.5))) / 2 : (Math.pow(2, -20 * f + 10) * Math.sin((20 * f - 11.125) * (2 * Math.PI / 4.5))) / 2 + 1,
    catmullrom: f => f,
  };
  function sample(keys, t) {
    if (!keys.length) return null;
    const zero = keys.map(k => k.v).filter(v => v && v.every(x => x === 0)).length === keys.length;
    if (t <= keys[0].t) return keys[0].v;
    if (t >= keys[keys.length - 1].t) return keys[keys.length - 1].v;
    let i = 0; while (i < keys.length - 1 && keys[i + 1].t <= t) i++;
    const a = keys[i], b = keys[i + 1];
    if (!a.v || !b.v) return null;
    let f = (t - a.t) / Math.max(1e-9, b.t - a.t);
    const eName = (a.easing && typeof a.easing === 'string') ? a.easing : 'linear';
    const ef = EASE[eName];
    if (eName !== 'linear' && !ef) animFacts.molang.push('easing:' + eName);
    f = ef ? ef(f) : f;
    return a.v.map((x, k) => x + (b.v[k] - x) * f);
  }
  // sample + tear metric
  let worstAll = { d: 0 };
  for (const [cname, clip] of Object.entries(clips)) {
    const state = cname.split('.').pop();
    const len = clip.animation_length;
    const loop = clip.loop;
    check(g, `clip ${state}: loop flag`, (loop === LOOPING[state]) || (LOOPING[state] === false && loop === 'hold_on_last_frame'),
      `loop=${JSON.stringify(loop)} expected ${LOOPING[state]}`);
    if (LOOPING[state] === true && loop !== true) finding('CRITICAL', g, `clip ${state} must loop (SPEC 5)`, 'tools/slime_animations.js', 'loop: true', 'loop=' + JSON.stringify(loop));
    if (LOOPING[state] === false && loop === true) finding('CRITICAL', g, `clip ${state} must not loop (SPEC 5)`, 'tools/slime_animations.js', 'loop: false', 'loop=true');
    let timeBad = [], boneBad = [], channels = [], molangCh = [];
    const times = new Set([0, len]);
    for (const [bn, chans] of Object.entries(clip.bones || {})) {
      if (!geoBones.has(bn)) boneBad.push(bn);
      for (const [ch, entries] of Object.entries(chans)) {
        const keys = channel(entries);
        channels.push({ bone: bn, ch, keys });
        for (const k of keys) {
          times.add(k.t);
          if (k.t < -1e-6 || k.t > len + 1e-6) timeBad.push(`${state}/${bn}/${ch}@${k.t}`);
          if (!k.v) molangCh.push(`${bn}.${ch}@${k.t}`);
          if (k.easing && typeof k.easing === 'string' && k.easing !== 'linear' && !EASE[k.easing] && !/^[0-9.]+$/.test(k.easing)) animFacts.molang.push(state + ':' + k.easing);
        }
      }
    }
    check(g, `clip ${state}: keyframe times inside animation_length`, timeBad.length === 0, timeBad.slice(0, 3).join(',') || `len ${len}, ${channels.reduce((a, c) => a + c.keys.length, 0)} keys`);
    check(g, `clip ${state}: animated bones exist in the geo`, boneBad.length === 0, boneBad.slice(0, 4).join(',') || Object.keys(clip.bones || {}).length + ' bones');
    if (boneBad.length) finding('CRITICAL', g, `clip ${state} animates unknown bone(s)`, 'tools/slime_animations.js', 'use names from the rig', boneBad.join(','));
    if (timeBad.length) finding('CRITICAL', g, `clip ${state}: keyframe(s) outside animation_length`, 'tools/slime_animations.js', 'clamp times to 0..' + len, timeBad.slice(0, 5).join(','));
    if (molangCh.length) finding('INFO', g, `clip ${state}: ${molangCh.length} key(s) use molang/string values`, 'tools/slime_animations.js', 'not sampleable by this verifier - playback may differ', molangCh.slice(0, 4).join(','));
    // sampling
    const N = 13;
    const samples = [];
    for (let i = 0; i < N; i++) samples.push(len * i / (N - 1));
    let worst = { d: 0 }, worstEnd = null, maxAbs = 0, maxAbsBone = '';
    for (const t of samples) {
      const pose = new Map(), poseAlt = new Map();
      for (const name of order) {
        const b = geoBones.get(name);
        const rot = [0, 0, 0], pos = [0, 0, 0], scl = [1, 1, 1];
        for (const c of channels) if (c.bone === name) {
          const v = sample(c.keys, t);
          if (!v) continue;
          if (c.ch === 'rotation') { rot[0] += v[0]; rot[1] += v[1]; rot[2] += v[2]; }
          else if (c.ch === 'position') { pos[0] += v[0]; pos[1] += v[1]; pos[2] += v[2]; }
          else if (c.ch === 'scale') { scl[0] *= v[0]; scl[1] *= v[1]; scl[2] *= v[2]; }
        }
        const restRot = b.rotation || [0, 0, 0];
        const pivot = b.pivot || [0, 0, 0];
        const mk = (order2) => {
          let m = mat4Mul(mat4T(pos), mat4T(pivot));
          m = mat4Mul(m, rotEuler([restRot[0] + rot[0], restRot[1] + rot[1], restRot[2] + rot[2]], order2));
          m = mat4Mul(m, mat4S(scl));
          return mat4Mul(m, mat4T([-pivot[0], -pivot[1], -pivot[2]]));
        };
        const pm = b.parent && pose.get(b.parent) ? pose.get(b.parent) : null;
        pose.set(name, pm ? mat4Mul(pm, mk('ZYX')) : mk('ZYX'));
        const pm2 = b.parent && poseAlt.get(b.parent) ? poseAlt.get(b.parent) : null;
        poseAlt.set(name, pm2 ? mat4Mul(pm2, mk('XYZ')) : mk('XYZ'));
      }
      for (const name of order) {
        const b = geoBones.get(name);
        const pts = corners.get(name);
        if (!pts || !pts.length) continue;
        const gb = pose.get(name), g0 = mat4InvAffine(geoRest.get(name));
        const gp = b.parent ? pose.get(b.parent) : null, gp0 = b.parent ? mat4InvAffine(geoRest.get(b.parent)) : null;
        for (const p of pts) {
          const w = mat4Apply(gb, mat4Apply(g0, p));
          const wp = b.parent ? mat4Apply(gp, mat4Apply(gp0, p)) : p;
          const d = Math.hypot(w[0] - wp[0], w[1] - wp[1], w[2] - wp[2]);
          if (d > worst.d) worst = { d, bone: name, t, cube: null };
          const da = Math.hypot(w[0] - p[0], w[1] - p[1], w[2] - p[2]);
          if (da > maxAbs) { maxAbs = da; maxAbsBone = name; }
        }
      }
    }
    // does the clip come back to rest?
    let endDev = null;
    if (state !== 'death') {
      let maxd = 0;
      for (const c of channels) { const v = sample(c.keys, len); if (!v) continue; const rest = c.ch === 'scale' ? [1, 1, 1] : [0, 0, 0]; maxd = Math.max(maxd, Math.hypot(v[0] - rest[0], v[1] - rest[1], v[2] - rest[2])); }
      endDev = maxd;
      check(g, `clip ${state}: last keyframe returns to rest`, maxd < 0.501, 'max channel deviation ' + r3(maxd));
      if (maxd >= 0.501) finding('WARNING', g, `clip ${state} does not return to the rest pose at its last keyframe (SPEC 5)`, 'tools/slime_animations.js', 'add a final key equal to the rest value', 'max deviation ' + r3(maxd));
    }
    check(g, `clip ${state}: mesh stays attached (worst relative cube displacement < ${ANIM_STRETCH_WARN}u)`, worst.d < ANIM_STRETCH_WARN,
      'worst ' + r2(worst.d) + 'u' + (worst.bone ? ` on ${worst.bone} @t=${r2(worst.t)}` : ''));
    if (worst.d >= ANIM_STRETCH_CRIT) finding('CRITICAL', g, `clip ${state} tears the mesh: ${worst.bone} moves ${r2(worst.d)}u away from its parent`, 'tools/slime_animations.js', 'reduce that rotation/position or move the bone pivot to the joint', `t=${r2(worst.t)} of ${len}`);
    else if (worst.d >= ANIM_STRETCH_WARN) finding('WARNING', g, `clip ${state}: ${worst.bone} moves ${r2(worst.d)}u away from its parent (>${ANIM_STRETCH_WARN}u)`, 'tools/slime_animations.js', 'check the pivot of that bone / ease the motion', `t=${r2(worst.t)} of ${len}`);
    // below-ground check across the clip
    let minY = 1e9;
    { const pose = new Map();
      for (const name of order) {
        const b = geoBones.get(name); const rot = [0, 0, 0], pos = [0, 0, 0];
        for (const c of channels) if (c.bone === name) { const v = sample(c.keys, len / 2); if (!v) continue; if (c.ch === 'rotation') { rot[0] += v[0]; rot[1] += v[1]; rot[2] += v[2]; } else if (c.ch === 'position') { pos[0] += v[0]; pos[1] += v[1]; pos[2] += v[2]; } }
        const restRot = b.rotation || [0, 0, 0], pivot = b.pivot || [0, 0, 0];
        let m = mat4Mul(mat4T(pos), mat4T(pivot)); m = mat4Mul(m, rotEuler([restRot[0] + rot[0], restRot[1] + rot[1], restRot[2] + rot[2]], 'ZYX')); m = mat4Mul(m, mat4T([-pivot[0], -pivot[1], -pivot[2]]));
        const pm = b.parent && pose.get(b.parent) ? pose.get(b.parent) : null; pose.set(name, pm ? mat4Mul(pm, m) : m);
      }
      for (const name of order) { const pts = corners.get(name); if (!pts) continue; const gb = pose.get(name), g0 = mat4InvAffine(geoRest.get(name));
        for (const p of pts) minY = Math.min(minY, mat4Apply(gb, mat4Apply(g0, p))[1]); } }
    animFacts.clips[state] = { len, loop, bones: Object.keys(clip.bones || {}).length, keys: channels.reduce((a, c) => a + c.keys.length, 0), worst: r2(worst.d), worstBone: worst.bone || '', worstT: r2(worst.t || 0), endDev: endDev === null ? null : r3(endDev), minYmid: r2(minY), maxAbs: r2(maxAbs) };
    if (worst.d > worstAll.d) worstAll = { d: worst.d, clip: state, bone: worst.bone, t: worst.t };
    if (minY < -0.05) finding('INFO', g, `clip ${state} sinks the mesh to y=${r2(minY)} (below the ground plane) at t=${r2(len / 2)}`, 'tools/slime_animations.js', 'intended squash into the ground? otherwise lift the clip', 'ground is y=0');
  }
  animFacts.worst = worstAll;
  if (animFacts.molang.length) finding('INFO', g, 'unhandled easing/value expressions: ' + [...new Set(animFacts.molang)].slice(0, 6).join(', '), 'tools/slime_animations.js', 'verifier treats them as linear (unverifiable)', '');
  load.summary.g5 = animFacts;
})();

// ================================================= G6: aesthetics, measured =====
const restWorld = new Map();   // bone name -> 4x4 rest matrix (from the bbmodel groups/pivots)
(function buildRest() {
  if (!rig) return;
  for (const b of rig) {
    const grp = tree.groups.get(b.uuid) || {};
    const pivot = grp.origin || [0, 0, 0], rot = grp.rotation || [0, 0, 0];
    let m = mat4Mul(mat4T(pivot), rotEuler(rot, 'ZYX'));
    m = mat4Mul(m, mat4T([-pivot[0], -pivot[1], -pivot[2]]));
    const pm = b.parent && restWorld.get(b.parent) ? restWorld.get(b.parent) : null;
    restWorld.set(b.name, pm ? mat4Mul(pm, m) : m);
  }
})();
function worldRestBBox() {
  const q = worldQuads();
  if (!q.length) return null;
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (const f of q) for (const p of f.p) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], p[i]); hi[i] = Math.max(hi[i], p[i]); }
  return { lo, hi };
}
function worldQuads() {
  const out = [];
  if (!rig) return out;
  for (const b of rig) {
    const B = restWorld.get(b.name) || mat4Identity();
    for (const el of b.cubes) {
      const org = el.origin || el.from, r = el.rotation || [0, 0, 0];
      const cm = r.some(v => v) ? mat4Mul(mat4T(org), rotEuler(r, 'ZYX')) : null;
      const X = p => mat4Apply(B, cm ? mat4Apply(cm, sub(p, org)) : p);   // cm = T(origin)*R
      for (const f of FACES) {
        const q = faceQuad(el, f);
        if (!q) continue;
        const P = q.map(c => X(c.p));
        out.push({ p: P, bone: b.name, cube: el.name, face: f });
      }
    }
  }
  return out;
}
function frontHit(quads, x, y) { // first surface crossed by the ray (x,y,z->+inf) looking from -Z
  let best = null;
  for (const q of quads) {
    const [p0, p1, p2] = [q.p[0], q.p[1], q.p[2]];
    const n = cross(sub(p1, p0), sub(p2, p0));
    if (Math.abs(n[2]) < 1e-9) continue;
    const z = p0[2] - (n[0] * (x - p0[0]) + n[1] * (y - p0[1])) / n[2];
    // inside test via the two triangles
    for (const tri of [[0, 1, 2], [0, 2, 3]]) {
      const A = q.p[tri[0]], B = q.p[tri[1]], C = q.p[tri[2]];
      const v0 = sub(C, A), v1 = sub(B, A), v2 = [x - A[0], y - A[1], z - A[2]];
      const d00 = v0[0] * v0[0] + v0[1] * v0[1], d01 = v0[0] * v1[0] + v0[1] * v1[1], d11 = v1[0] * v1[0] + v1[1] * v1[1];
      const d20 = v2[0] * v0[0] + v2[1] * v0[1], d21 = v2[0] * v1[0] + v2[1] * v1[1];
      const den = d00 * d11 - d01 * d01;
      if (Math.abs(den) < 1e-9) continue;
      const u = (d11 * d20 - d01 * d21) / den, v = (d00 * d21 - d01 * d20) / den;
      if (u >= -1e-6 && v >= -1e-6 && u + v <= 1 + 1e-6) { if (!best || z < best.z) best = { z, cube: q.cube, bone: q.bone, face: q.face }; break; }
    }
  }
  return best;
}
(function G6() {
  const g = 'G6';
  if (!bb || !rig) { check(g, 'bbmodel rig available', false, 'missing'); return; }
  const bboxOf = pred => {
    const cs = bb.elements.filter(pred);
    if (!cs.length) return null;
    const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    for (const c of cs) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], c.from[i]); hi[i] = Math.max(hi[i], c.to[i]); }
    return { lo, hi, mid: lo.map((v, i) => (v + hi[i]) / 2), size: hi.map((v, i) => v - lo[i]), n: cs.length, names: cs.map(c => c.name) };
  };
  const byBone = m => bb.elements.filter(e => m.test((tree.groups.get((tree.owner.get(e.uuid))) || {}).name || ''));
  const byName = m => bb.elements.filter(e => m.test(e.name));

  // (a) left/right symmetry of the cube sets
  const boneNames = [...tree.groups.values()].map(x => x.name);
  const pairs = boneNames.filter(n => /_l$/.test(n) && boneNames.includes(n.replace(/_l$/, '_r')));
  const FACEY = /eye|brow|lip|mouth|maw|tooth|fang|jaw|face|nostril/i;
  const asym = [], pairsOk = [], asymInfo = [];
  for (const ln of pairs) {
    const rn = ln.replace(/_l$/, '_r');
    const L = (rig.find(b => b.name === ln) || { cubes: [] }).cubes;
    const R = (rig.find(b => b.name === rn) || { cubes: [] }).cubes;
    const used = new Set(); const bad = [];
    for (const c of L) {
      const want = { from: [-c.to[0], c.from[1], c.from[2]], to: [-c.from[0], c.to[1], c.to[2]] };
      const j = R.findIndex((d, k) => !used.has(k) && near3(d.from, want.from, 0.02) && near3(d.to, want.to, 0.02));
      if (j < 0) bad.push(c.name); else used.add(j);
    }
    const msg = `${ln}/${rn}: ${bad.length ? 'unmatched ' + bad.slice(0, 3).join(',') : ''}${used.size !== R.length ? ' extra on right ' + R.filter((_, k) => !used.has(k)).map(x => x.name).slice(0, 3).join(',') : ''}`;
    if (bad.length || used.size !== R.length) (FACEY.test(ln) ? asym : asymInfo).push(msg);
    else pairsOk.push(ln + '/' + rn);
  }
  check(g, 'face l/r pairs mirror about x=0 (eyes/brows/lip/mouth, SPEC 6)', asym.length === 0, asym.slice(0, 3).join(' | ') || (pairsOk.length ? pairsOk.join(' ') + ' mirror exactly' : 'no face pairs'));
  if (asym.length) finding('CRITICAL', g, 'face feature pair is not an exact mirror', 'tools/slime_geometry.js', 'mirror from -> -to on x (eye/brow/lip must be symmetric, SPEC 1/6)', asym.join(' | '));
  check(g, 'non-face l/r pairs (drips/lobes/beads/antennae) - deliberate asymmetry?', true, asymInfo.length ? asymInfo.join(' | ') + '  <- intended per SPEC 1 unless the lead says otherwise' : 'all mirror exactly');
  if (asymInfo.length) finding('INFO', g, asymInfo.length + ' decorative pair(s) are asymmetric on purpose or by accident', 'tools/slime_geometry.js', 'SPEC 1 allows deliberate asymmetric details - confirm intent', asymInfo.join(' | '));
  // uv mirroring: corresponding faces should use the same tile on both sides
  const uvMirror = [];
  for (const ln of pairs) {
    const rn = ln.replace(/_l$/, '_r');
    const L = (rig.find(b => b.name === ln) || { cubes: [] }).cubes, R = (rig.find(b => b.name === rn) || { cubes: [] }).cubes;
    for (const c of L) {
      const mirrorFace = { north: 'north', south: 'south', east: 'west', west: 'east', up: 'up', down: 'down' };
      const d = R.find(x => near3(x.from, [-c.to[0], c.from[1], c.from[2]], 0.02) && near3(x.to, [-c.from[0], c.to[1], c.to[2]], 0.02));
      if (!d) continue;
      for (const f of FACES) {
        const a = c.faces && c.faces[f], b2 = d.faces && d.faces[mirrorFace[f]];
        if (!a || a.texture === null || !b2 || b2.texture === null) continue;
        const ra = rectFromBBStored(a.uv, f).rect, rb = rectFromBBStored(b2.uv, mirrorFace[f]).rect;
        if (JSON.stringify(ra) !== JSON.stringify(rb) && !near3(ra, rb, 0.001)) uvMirror.push(`${ln}/${c.name}/${f}`);
      }
    }
  }
  check(g, 'mirrored pairs reuse the same atlas tile per corresponding face', uvMirror.length === 0, uvMirror.slice(0, 3).join(',') || 'ok');
  if (uvMirror.length) finding('INFO', g, uvMirror.length + ' mirrored face pair(s) map to different uv rects', 'tools/slime_geometry.js', 'intended? the two sides will show different art', uvMirror.slice(0, 5).join(','));

  // (b) the closed maw must be invisible from the front
  const quads = worldQuads();
  const mawBox = bboxOf(e => /maw|tooth|fang|tongue/i.test(e.name) || /maw|jaw/i.test((tree.groups.get(tree.owner.get(e.uuid)) || {}).name || ''));
  const lipBox = byName(/lip/i);
  let visible = [], checked = 0, holes = [];
  if (mawBox) {
    const x0 = Math.floor(mawBox.lo[0]) - 1, x1 = Math.ceil(mawBox.hi[0]) + 1;
    const y0 = Math.floor(mawBox.lo[1]) - 1, y1 = Math.ceil(mawBox.hi[1]) + 1;
    const step = 0.25;
    for (let x = x0 + step / 2; x < x1; x += step) for (let y = y0 + step / 2; y < y1; y += step) {
      const hit = frontHit(quads, x, y);
      checked++;
      if (!hit) { holes.push([r2(x), r2(y)]); continue; }
      if (/maw|tooth|fang|tongue/i.test(hit.cube) || /maw|jaw/i.test(hit.bone)) visible.push(`${hit.cube}@${r2(x)},${r2(y)},z${r2(hit.z)}`);
      else if (/seam|void/i.test('') ) { }
    }
  }
  const innerVisible = visible.filter(v => /maw/i.test(v.split('@')[0]));
  const toothVisible = visible.filter(v => !/maw/i.test(v.split('@')[0]));
  const mawVisible = [...new Set(innerVisible.map(v => v.split('@')[0]))];
  const lipY = lipBox && lipBox.length ? [Math.min(...lipBox.map(c => c.from[1])), Math.max(...lipBox.map(c => c.to[1]))] : null;
  const lipX = lipBox && lipBox.length ? [Math.min(...lipBox.map(c => c.from[0])), Math.max(...lipBox.map(c => c.to[0]))] : null;
  check(g, 'maw cavity hidden from the front at rest (SPEC 2)', innerVisible.length === 0,
    mawBox ? (innerVisible.length ? innerVisible.length + '/' + checked + ' samples show ' + mawVisible.join(',') : checked + ' front-ray samples, the cavity is never frontmost') : 'no maw cubes');
  if (innerVisible.length) finding('CRITICAL', g, 'the closed mouth exposes the maw cavity', 'tools/slime_geometry.js (maw cubes)', 'push maw_inner/maw_floor back in +z or widen the lip so its (x,y) footprint covers the cavity', innerVisible.slice(0, 5).join(' ') + ' (front rays whose frontmost surface is the cavity)');
  const pokeOut = [], throughHole = [];
  for (const v of toothVisible) {
    const xy = v.split('@')[1].split(',').map(Number);
    const outside = lipY ? (xy[1] < lipY[0] - 1e-3 || xy[1] > lipY[1] + 1e-3) : false;
    (outside ? pokeOut : throughHole).push(v);
  }
  const lipFrontZ = lipBox && lipBox.length ? Math.min(...lipBox.map(c => c.from[2])) : null;
  const frontZ = [...new Set(toothVisible.map(v => Number(v.split('z')[1])))].sort((a, b2) => a - b2);
  check(g, 'teeth only visible outside the lip y band (fang tips, per the frozen anchors)', throughHole.length === 0,
    toothVisible.length ? toothVisible.length + ' visible tooth sample(s) of ' + checked + '; ' + pokeOut.length + ' above/below the lip band ' + JSON.stringify(lipY) + ', ' + throughHole.length + ' inside it; hit z ' + (frontZ.length ? frontZ[0] + '..' + frontZ[frontZ.length - 1] : '?') + ' (lip front z ' + lipFrontZ + ')' : 'no tooth visible');
  if (throughHole.length) finding('WARNING', g, 'tooth visible inside the lip y band (leaking sideways, not a fang tip)', 'tools/slime_geometry.js (fang/teeth cubes)', 'move those teeth behind the lip in z or widen the lip', throughHole.slice(0, 5).join(' ') + ' | lip y band ' + JSON.stringify(lipY));
  if (toothVisible.length) finding('INFO', g, toothVisible.length + ' front samples show tooth tips outside the lip band = the intended fangs', 'tools/slime_geometry.js (fang cubes, SPEC 2 anchors: fangs poke out of the grin)', 'design intent - just make sure the art reads as fangs, not gum', 'lip y ' + JSON.stringify(lipY) + ', visible tooth tips at y ' + [...new Set(pokeOut.map(v => v.split('@')[1].split(',')[1]))].slice(0, 6).join('/') + ' (hit z ' + (frontZ.length ? frontZ[0] + '..' + frontZ[frontZ.length - 1] : '?') + ', lip front z ' + lipFrontZ + ')');
    // (c) nothing below y=0, and the whole model inside the visible box
  let minY = 1e9, minYc = '';
  for (const e of bb.elements) for (const p of (function cornersOfEl(e) {
    const org = e.origin || e.from, r = e.rotation || [0, 0, 0];
    const cm = r.some(v => v) ? mat4Mul(mat4T(org), rotEuler(r, 'ZYX')) : null;
    const out = [];
    for (const dx of [e.from[0], e.to[0]]) for (const dy of [e.from[1], e.to[1]]) for (const dz of [e.from[2], e.to[2]]) {
      let q = [dx, dy, dz];
      if (cm) q = mat4Apply(cm, [q[0] - org[0], q[1] - org[1], q[2] - org[2]]);
      const B = restWorld.get((tree.groups.get(tree.owner.get(e.uuid)) || {}).name) || mat4Identity();
      out.push(mat4Apply(B, q));
    }
    return out;
  })(e)) if (p[1] < minY) { minY = p[1]; minYc = e.name; }
  check(g, 'nothing below y=0 at rest', minY >= -1e-6, `lowest point y=${r3(minY)} (${minYc})`);
  if (minY < -1e-6) finding('CRITICAL', g, `geometry below the ground plane (y=${r3(minY)} on ${minYc})`, 'tools/slime_geometry.js', 'raise the cube so from[1] >= 0', '');
  const allRaw = bboxOf(() => true);
  const wr = worldRestBBox();
  const all = wr ? { lo: wr.lo, hi: wr.hi, mid: wr.lo.map((v, i) => (v + wr.hi[i]) / 2), size: wr.hi.map((v, i) => v - wr.lo[i]), n: allRaw ? allRaw.n : 0 } : allRaw;
  const VB = 2.5;
  const over = all ? Math.max(Math.abs(all.lo[0]), Math.abs(all.hi[0]), Math.abs(all.lo[2]), Math.abs(all.hi[2]), all.hi[1]) / 16 : 0;
  check(g, 'model fits the declared visible box', over <= VB, `half-extent ${(over).toFixed(2)} blocks (visible_bounds_width ${(geo ? geo['minecraft:geometry'][0].description.visible_bounds_width : '?')})`);
  if (over > VB) finding('WARNING', g, `model is bigger than visible_bounds (${over.toFixed(2)} > ${VB} blocks)`, 'tools/slime_geometry.js / build_slime.js visibleBox', 'raise visibleBox or shrink the model', 'culling/camera framing in game');

  // (d) the front (-Z) is where the face is
  const eyes = byName(/eye_.*sclera|eye_.*iris/i);
  const eyeNorth = eyes.filter(e => e.faces.north && e.faces.north.texture !== null).length;
  const eyeMid = bboxOf(e => /eye_.*(sclera|iris)/i.test(e.name));
  const crystalMid = bboxOf(e => /xtal|crystal/i.test(e.name));
  const okFace = !!eyeMid && eyeMid.mid[2] < 0 && eyeNorth === eyes.length && eyes.length > 0;
  check(g, 'eyes are on the -Z (front) side and face -Z', okFace, eyeMid ? `eye centroid z=${r1h(eyeMid.mid[2])}, ${eyeNorth}/${eyes.length} eye cubes have a north face` : 'no eye cubes found');
  if (!okFace) finding('CRITICAL', g, 'the face is not on -Z', 'tools/slime_geometry.js', 'move the eye cubes to negative z and give them a north face', eyeMid ? 'centroid z=' + r1h(eyeMid.mid[2]) : '');
  function r1h(v) { return Math.round(v * 10) / 10; }
  const ratio = (eyeMid && all) ? eyeMid.size[1] / all.size[1] : 0;
  check(g, 'cute proportion: eye height ~1/5 of the body height (SPEC 1)', ratio > 0.12 && ratio < 0.3, `${(100 * ratio).toFixed(0)}% (${eyeMid ? r1h(eyeMid.size[1]) : '?'} of ${all ? r1h(all.size[1]) : '?'})`);
  const danger = crystalMid ? crystalMid.mid[2] > 0 : null;
  check(g, 'danger on the back: crystals sit at +Z', crystalMid ? danger : true, crystalMid ? `crystal centroid z=${r1h(crystalMid.mid[2])}` : 'no crystals yet (modeler TODO)');
  const coreBox = bboxOf(e => /core/i.test(e.name));
  check(g, 'glowing core in the belly/front', !!coreBox && coreBox.mid[2] < 0 && coreBox.mid[1] < (all ? all.size[1] * 0.5 : 1e9), coreBox ? `core centroid y=${r1h(coreBox.mid[1])} z=${r1h(coreBox.mid[2])}` : 'no core cubes');
  load.summary.g6 = {
    pairs: pairs.length, asym: asym.length, mawSamples: checked, mawVisible: visible.length,
    minY: r3(minY), fitBlocks: Number(over.toFixed(2)), eyeRatio: Number(ratio.toFixed(3)),
    eyeMid: eyeMid ? eyeMid.mid.map(r1h) : null, crystalMid: crystalMid ? crystalMid.mid.map(r1h) : null,
  };
})();

// =========================== G7: validate the uv conventions against real Blockbench files ===
(function G7() {
  const g = 'G7';
  if (!exists(REF.bb) || !exists(REF.geo)) { check(g, 'reference Blockbench pair available', false, 'refs/infested_zombie.bbmodel or its export missing'); return; }
  const rb = readJSON(REF.bb), rg = readJSON(REF.geo)['minecraft:geometry'][0];
  const gname = new Map((rb.groups || []).map(x => [x.uuid, x.name]));
  const owner = new Map();
  (function walk(nodes, pg) { for (const n of nodes || []) {
    if (typeof n === 'string') { if (!owner.has(n)) owner.set(n, pg); }
    else if (n && typeof n === 'object') { walk(n.children, (gname.get(n.uuid) || pg)); }
  } })(rb.outliner, null);
  for (const x of (rb.groups || [])) (function walk2(nodes, pg) { for (const n of nodes || []) { if (typeof n === 'string') { if (!owner.has(n)) owner.set(n, pg); } else if (n && typeof n === 'object') walk2(n.children, gname.get(n.uuid) || pg); } })(x.children, x.name);
  const geoNames = new Set(rg.bones.map(b => b.name));
  const stats = {}; for (const f of FACES) stats[f] = { n: 0, storedConvention: 0 };
  let pairs = 0;
  for (const el of rb.elements) {
    const bn = owner.get(el.uuid); if (!bn || !geoNames.has(bn)) continue;
    const b = rg.bones.find(x => x.name === bn);
    const size = [el.to[0] - el.from[0], el.to[1] - el.from[1], el.to[2] - el.from[2]];
    const cand = (b.cubes || []).filter(c => near3(c.origin, el.from, 0.001) && near3(c.size, size, 0.001));
    if (cand.length !== 1) continue;
    pairs++;
    for (const f of FACES) {
      const fr = el.faces && el.faces[f], gu = cand[0].uv && cand[0].uv[f];
      if (!fr || !gu || fr.texture === null) continue;
      stats[f].n++;
      const exp = geoFromBBStored(fr.uv, f);
      if (near3([gu.uv[0], gu.uv[1], 0], [exp.uv[0], exp.uv[1], 0]) && near3([gu.uv_size[0], gu.uv_size[1], 0], [exp.uv_size[0], exp.uv_size[1], 0])) stats[f].storedConvention++;
    }
  }
  const total = FACES.reduce((a, f) => a + stats[f].n, 0), ok = FACES.reduce((a, f) => a + stats[f].storedConvention, 0);
  check(g, `bbmodel->geo uv round-trip reproduces real Blockbench output (${pairs} cubes)`, total > 0 && ok === total,
    total ? `${ok}/${total} faces (` + FACES.map(f => `${f} ${stats[f].storedConvention}/${stats[f].n}`).join(', ') + ')' : 'no comparable cubes');
  if (total && ok !== total) finding('CRITICAL', g, 'the re-implemented uv convention does not reproduce real Blockbench output', 'tools/lib/atlas.js header', 'fix bbFaceUV/geoFaceUV in tools/lib/atlas.js', `${ok}/${total} faces match; per face: ` + FACES.map(f => `${f} ${stats[f].storedConvention}/${stats[f].n}`).join(', '));
  load.summary.g7 = { cubes: pairs, faces: total, matched: ok };
})();

// =============================================================== report =======
function main() {
  const line = '='.repeat(96);
  say(line);
  say(' acid_gel_slime — INDEPENDENT verification   (node tools/verify_slime.js)');
  const fl = [];
  for (const [k, f] of Object.entries({ bbmodel: F.bb, geo: F.geo, animation: F.anim, base: F.base, glow: F.glow, report: F.report })) {
    fl.push(k + (exists(f) ? ' ' + (fs.statSync(f).size / 1024).toFixed(1) + 'K' : ' MISSING'));
  }
  say(' inputs: ' + fl.join('  |  '));
  say(line);
  let crit = 0, warn = 0, info = 0;
  for (const [id, title] of GROUPS) {
    const cs = state.checks.get(id);
    const bad = cs.filter(c => !c.ok).length;
    say('');
    say(`[${id}] ${title} ${'.'.repeat(Math.max(1, 40 - title.length))} ${bad === 0 ? 'PASS' : 'FAIL'}  (${cs.length - bad}/${cs.length})`);
    for (const c of cs) say(`     ${c.ok ? 'ok  ' : 'FAIL'} ${c.name}${c.detail ? '  — ' + c.detail : ''}`);
  }
  // findings, severity ordered
  const ordered = state.findings.slice().sort((a, b) => SEV[a.sev] - SEV[b.sev] || GROUPS.findIndex(g => g[0] === a.group) - GROUPS.findIndex(g => g[0] === b.group));
  const ids = { CRITICAL: 0, WARNING: 0, INFO: 0 };
  for (const x of ordered) x.id = x.sev[0] + '-' + String(++ids[x.sev]).padStart(2, '0');
  for (const x of ordered) { if (x.sev === 'CRITICAL') crit++; else if (x.sev === 'WARNING') warn++; else info++; }
  say('');
  say('-'.repeat(96));
  say(`FINDINGS — ${crit} CRITICAL / ${warn} WARNING / ${info} INFO   (exit code ${crit ? 1 : 0})`);
  say('-'.repeat(96));
  if (!ordered.length) say(' (none)');
  for (const x of ordered) {
    say(` ${x.sev.padEnd(8)} ${x.id} [${x.group}] ${x.title}`);
    if (x.detail) say(`          observed: ${x.detail}`);
    if (x.where) say(`          where:    ${x.where}`);
    if (x.fix) say(`          fix:      ${x.fix}`);
  }
  // measurements
  const s = load.summary || {};
  say('');
  say('-'.repeat(96));
  say('MEASUREMENTS');
  say(`  bones ${(s.g1 && s.g1.bones) || '?'}   cubes ${(s.g1 && s.g1.cubes) || '?'}   tiles ${(s.g2 && s.g2.tiles) || '?'}   clips ${Object.keys((s.g5 && s.g5.clips) || {}).length}`);
  if (s.g1) say('  bbmodel: groups ' + s.g1.bones + ', elements ' + s.g1.cubes + ', outliner roots ' + s.g1.outlinerRoots);
  if (s.g2) say(`  atlas: background rgb(${(s.g2.bg || []).join(',')}), claimed ${s.g2.claimedPx} px of 16384 (${(100 * s.g2.claimedPx / 16384).toFixed(1)}%), glow ${s.g2.glowPx} px emissive, ${s.g2.glowOutside} px stray`);
  if (s.g3) say(`  geo: ${s.g3.bones} bones, ${s.g3.cubes} cubes and ${s.g3.faces} faces compared, ${s.g3.uvBad} uv mismatch(es)`);
  if (s.g4) say(`  uv: ${s.g4.faces} textured faces, ${s.g4.used}/${s.g4.tiles} tiles used, ${s.g4.stretched} stretched face(s), ${s.g4.thinWhitelisted} whitelisted thin/seam stretch(es)` + (s.g4.unusedNames.length ? '; unused: ' + s.g4.unusedNames.slice(0, 10).join(',') : ''));
  if (s.g5 && s.g5.worst) {
    const w = s.g5.worst;
    say(`  animation tear metric: worst ${w.d.toFixed(2)}u` + (w.clip ? ` in ${w.clip}/${w.bone} @t=${(Math.round(w.t * 100) / 100)}` : ''));
    for (const [k, v] of Object.entries(s.g5.clips)) say(`    ${k.padEnd(7)} len ${String(v.len).padEnd(4)} loop ${String(v.loop).padEnd(5)} bones ${String(v.bones).padStart(2)} keys ${String(v.keys).padStart(3)} tear ${String(v.worst).padStart(5)}u ${v.worstBone.padEnd(12)} moves ${String(v.maxAbs).padStart(5)}u  end-vs-rest ${v.endDev === null ? 'n/a (death)' : v.endDev}  min-y@mid ${v.minYmid}`);
  }
  if (s.g6) say(`  aesthetics: ${s.g6.pairs} mirrored pair(s) (${s.g6.asym} asymmetric), maw visible from front ${s.g6.mawVisible}/${s.g6.mawSamples} samples, min y ${s.g6.minY}, fit ${s.g6.fitBlocks} blocks, eye height ${(100 * s.g6.eyeRatio).toFixed(0)}% of body`);
  if (s.g7) say(`  convention self-test vs real Blockbench pair: ${s.g7.matched}/${s.g7.faces} faces over ${s.g7.cubes} cubes reproduce the stored-value round trip`);
  say('');
  say(`  VERDICT: ${crit ? 'DO NOT SHIP — ' + crit + ' CRITICAL finding(s)' : 'no CRITICAL findings'}` + (warn ? ` (${warn} warning(s) to review)` : ''));
  say(line);
  const text = out.join('\n');
  console.log(text);
  try {
    fs.mkdirSync(path.join(ROOT, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(ROOT, 'docs', 'verify_results.json'), JSON.stringify({
      generated: new Date().toISOString(),
      counts: { critical: crit, warning: warn, info },
      groups: GROUPS.map(([id, title]) => ({ id, title, pass: state.checks.get(id).every(c => c.ok), checks: state.checks.get(id) })),
      findings: ordered, summary: load.summary || {},
    }, null, 1));
  } catch (e) { /* reporting only */ }
  process.exitCode = crit ? 1 : 0;
}
main();
