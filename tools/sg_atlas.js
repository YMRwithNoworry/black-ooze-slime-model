'use strict';
// 史莱姆少女 / SLIME GIRL — texture atlas plan.  OWNER: lead.
//
// A chibi rig is built from small cubes, and a tile that does not match its face size stretches
// the pixel grid.  Rather than hand-tuning 90 tile sizes, the atlas declares one base tile per
// material and derives a correctly sized tile the first time a face asks for a new size.  The
// derived tile keeps the base name as a prefix (hair@3x2), so the painter still dispatches on
// family and every face ends up on an exact 1 texel = 1 unit grid.
const { Atlas } = require('./lib/atlas.js');

const RES = 128;

// name, w, h, family  — the size here is the common case; other sizes are derived on demand.
const BASE = [
  ['hair',       2, 2, 'hair'],
  ['hair_tip',   2, 2, 'hair_tip'],
  ['hair_lit',   2, 2, 'hair_lit'],
  ['hair_pixel', 4, 4, 'hair_pixel'],
  ['ahoge',      2, 2, 'hair_lit'],
  ['ahoge_tip',  2, 2, 'hair_tip'],
  ['side_l',     2, 2, 'hair_lit'],
  ['side_r',     2, 2, 'hair_lit'],
  ['side_arm',   2, 2, 'hair'],
  ['hairaccent_l', 1, 1, 'hair_pixel'],
  ['hairaccent_r', 1, 1, 'hair_pixel'],

  ['skin',       3, 2, 'skin'],
  ['skin_lit',   2, 2, 'skin_lit'],
  ['limb',       2, 2, 'skin'],
  ['neck',       4, 2, 'skin'],

  ['head_front', 14, 14, 'skin_lit'],
  ['head_back',  14, 14, 'hair'],
  ['head_side',  12, 14, 'hair'],
  ['head_top',   14, 12, 'skin_lit'],
  ['face_l',     5, 3, 'face',      { mirror: false }],
  ['face_r',     5, 3, 'face',      { mirror: true }],
  ['face_ld',    5, 3, 'face_dark', { mirror: false }],
  ['face_rd',    5, 3, 'face_dark', { mirror: true }],
  ['brow_l',     3, 1, 'brow',       { mirror: false }],
  ['brow_r',     3, 1, 'brow',       { mirror: true }],
  ['brow_la',    3, 1, 'brow_angry', { mirror: false }],
  ['brow_ra',    3, 1, 'brow_angry', { mirror: true }],
  ['blush_l',    2, 1, 'blush',      { mirror: false }],
  ['blush_r',    2, 1, 'blush',      { mirror: true }],
  ['mouth_happy',  3, 1, 'mouth', { shape: 'happy' }],
  ['mouth_flat',   3, 1, 'mouth', { shape: 'flat' }],
  ['mouth_trouble',3, 1, 'mouth', { shape: 'trouble' }],
  ['mouth_o',    2, 1, 'mouth_o'],
  ['bang_f0',    2, 5, 'hair_lit'],
  ['bang_f1',    2, 5, 'hair_lit'],
  ['bang_f2',    2, 5, 'hair_lit'],
  ['bang_f3',    2, 5, 'hair_lit'],
  ['bang_f4',    2, 5, 'hair_lit'],
  ['bang_f5',    2, 5, 'hair_lit'],
  ['bang_side',  2, 5, 'hair'],

  ['skirt',      8, 4, 'cloth_lit'],
  ['skirt_back', 8, 4, 'cloth'],
  ['skirt_side', 6, 4, 'cloth'],
  ['pleat',      2, 3, 'cloth_lit'],
  ['cloth_pixel',1, 1, 'cloth_pixel'],
  ['torso',      8, 6, 'cloth_lit'],
  ['torso_back', 8, 6, 'cloth'],
  ['torso_side', 6, 6, 'cloth'],
  ['torso_top',  8, 6, 'cloth_lit'],
  ['collar',     8, 2, 'cloth_band'],
  ['strap',      4, 2, 'cloth_lit'],
  ['sleeve',     5, 8, 'cloth'],
  ['sleeve_lit', 5, 4, 'cloth_lit'],
  ['cloth',      3, 2, 'cloth_lit'],
  ['cloth_band', 3, 4, 'cloth_band'],
  ['band',       3, 1, 'band'],
  ['band_side',  4, 1, 'band'],
  ['sock',       3, 3, 'sock'],
  ['sock_side',  4, 3, 'sock'],
  ['sock_top',   3, 4, 'sock'],
  ['cuff',       5, 1, 'cloth_band'],
  ['cuff_side',  4, 1, 'cloth_band'],
  ['cuff_top',   5, 4, 'cloth_band'],
  ['boot',       5, 3, 'boot'],
  ['boot_side',  4, 3, 'boot'],
  ['sole',       5, 4, 'sole'],
  ['boot_p',     1, 1, 'cloth_pixel'],

  ['core',       4, 4, 'gel'],
  ['core_lit',   4, 4, 'gel_lit'],
  ['ear',        3, 3, 'gel'],
  ['blob_2',     2, 2, 'gel'],
  ['blob_1',     1, 1, 'gel_lit'],
  ['swatch',    12, 10, 'swatch'],
];

function build(res = RES) {
  const A = new Atlas(res, res, 1);
  for (const b of BASE) A.alloc(b[0], b[1], b[2], b[3], b[4] || {});

  const derived = [];
  /** exact-size tile for a face: the base tile itself, or a derived one on first use */
  function sized(name, w, h) {
    w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
    const t = A.get(name);
    if (t.w === w && t.h === h) return { rect: t.rect.slice(), family: t.family, tile: t.name };
    const key = name + '@' + w + 'x' + h;
    if (!A.has(key)) {
      const d = A.alloc(key, w, h, t.family, Object.assign({}, t.params, { base: name }));
      derived.push(key);
    }
    const d = A.get(key);
    return { rect: d.rect.slice(), family: d.family, tile: d.name };
  }

  /** all six faces of an axis-aligned box on one material, each sized to its own face */
  function box(name, from, to) {
    const sx = to[0] - from[0], sy = to[1] - from[1], sz = to[2] - from[2];
    return {
      north: sized(name, sx, sy), south: sized(name, sx, sy),
      east: sized(name, sz, sy), west: sized(name, sz, sy),
      up: sized(name, sx, sz), down: sized(name, sx, sz),
    };
  }

  return {
    atlas: A, res: res, list: A.list, tiles: A.tiles,
    get: (n) => A.get(n), has: A.has, face: sized, box: box,
    derived: derived, warnings: A.warnings,
  };
}

module.exports = { build: build, RES: RES, BASE: BASE };
