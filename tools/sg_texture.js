'use strict';
// 史莱姆少女 / SLIME GIRL — texture painter.  OWNER: lead.
//
// Every pixel comes from a value-noise field pushed through a per-material palette ramp: the
// ramp's hard steps turn a smooth field into readable clumps, which is what makes translucent
// gel, cloth and skin read as materials instead of as flat fill.  On top of the material sit
// gravity cues (a bright waterline along the top edge, a dark pool along the bottom) and a few
// hard 1px speculars, so the gel keeps its voxel facets.
const { Canvas, TileView, rgb, shade, withAlpha, prng } = require('./lib/canvas.js');

function hash2(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  h = ((h ^ (h >>> 13)) * 1274126177) | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function valueNoise(x, y, scale, seed) {
  const fx = x / scale, fy = y / scale;
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const tx = fx - x0, ty = fy - y0;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const a = hash2(x0, y0, seed), b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed), d = hash2(x0 + 1, y0 + 1, seed);
  return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function material(v, t, o) {
  const seed = o.seed, scale = o.scale || 2.2, contrast = o.contrast || 1.35;
  const ramp = o.ramp, jitter = o.jitter === undefined ? 0.06 : o.jitter;
  const rnd = prng('mat:' + t.name);
  for (let y = 0; y < t.h; y++) {
    for (let x = 0; x < t.w; x++) {
      let n = valueNoise(x + 0.5, y + 0.5, scale, seed) * 0.66 +
              valueNoise(x + 0.5, y + 0.5, scale * 0.45, seed + 17) * 0.34;
      n = clamp((n - 0.5) * contrast + 0.5, 0, 0.9999);
      let idx = Math.floor(n * ramp.length);
      if (rnd() < jitter) idx = clamp(idx + (rnd() < 0.5 ? -1 : 1), 0, ramp.length - 1);
      v.set(x, y, shade(ramp[idx], (rnd() - 0.5) * (o.grain === undefined ? 0.05 : o.grain)));
    }
  }
}

const RAMPS = {
  hair:     ['hairHi', 'hairLight', 'hairBase', 'hairBase', 'hairMid', 'hairMid', 'hairDark', 'hairDeep', 'hairRim'],
  hairLit:  ['hairHi', 'hairHi', 'hairLight', 'hairLight', 'hairBase', 'hairBase', 'hairMid', 'hairDark'],
  hairTip:  ['hairLight', 'hairBase', 'hairBase', 'hairMid', 'hairMid', 'hairDark', 'hairDeep', 'hairCore'],
  hairPix:  ['hairHi', 'hairLight', 'hairLight', 'hairBase', 'hairMid', 'hairMid', 'hairDark', 'hairDeep'],
  skin:     ['skinHi', 'skin', 'skin', 'skinMid', 'skinShade'],
  skinLit:  ['skinHi', 'skinHi', 'skin', 'skin', 'skinMid'],
  cloth:    ['cloth', 'clothMid', 'clothMid', 'clothDark', 'clothDark', 'clothDeep'],
  clothLit: ['clothHi', 'cloth', 'cloth', 'clothMid', 'clothMid', 'clothDark'],
  band:     ['clothMid', 'clothDark', 'clothDark', 'clothDeep', 'clothEdge'],
  clothPix: ['clothHi', 'cloth', 'clothMid', 'clothDark', 'clothDeep'],
  sock:     ['clothDark', 'clothDark', 'clothDeep', 'clothEdge', 'clothEdge'],
  boot:     ['cloth', 'clothMid', 'clothMid', 'clothDark', 'clothDeep', 'clothEdge'],
  sole:     ['clothDeep', 'clothEdge', 'clothEdge', 'clothEdge'],
  gel:      ['sgelHi', 'sgel', 'sgel', 'sgelMid', 'sgelMid', 'sgelDark', 'sgelDark', 'sgelDeep'],
  gelLit:   ['sgelHi', 'sgelHi', 'sgel', 'sgel', 'sgelMid', 'sgelMid'],
};

function skinTile(v, t, ramp, seed) {
  material(v, t, { ramp: ramp, seed: seed, scale: 3.2, contrast: 1.15, grain: 0.02, jitter: 0.03 });
  v.shadowInner(0, 0, t.w, t.h, rgb('skinShade'), 0.45);
}
function clothTile(v, t, ramp, seed) {
  material(v, t, { ramp: ramp, seed: seed, scale: 2.0, contrast: 1.5, grain: 0.05, jitter: 0.10 });
  for (let x = 0; x < t.w; x++) v.blend(x, 0, rgb('clothHi'), 0.30);
}
function gelTile(v, g, t, ramp, seed) {
  material(v, t, { ramp: ramp, seed: seed, scale: 1.7, contrast: 1.6, grain: 0.05, jitter: 0.12 });
  for (let x = 0; x < t.w; x++) v.blend(x, 0, rgb('sgelHi'), 0.55);
  for (let x = 0; x < t.w; x++) v.blend(x, t.h - 1, rgb('sgelDeep'), 0.30);
  const rnd = prng('gel:' + t.name);
  const n = Math.max(1, Math.round(t.w * t.h / 12));
  for (let i = 0; i < n; i++) {
    const x = Math.floor(rnd() * t.w), y = Math.floor(rnd() * t.h);
    v.set(x, y, rgb('sgelHi'));
    g.set(x, y, withAlpha(rgb('sgelCore'), 175));
  }
}
function pixelDecor(v, t, colors, per) {
  const rnd = prng('px:' + t.name);
  for (let i = 0; i < per; i++) {
    const x = Math.floor(rnd() * t.w), y = Math.floor(rnd() * t.h);
    v.set(x, y, rgb(colors[Math.floor(rnd() * colors.length)]));
  }
}

// 5x3 chibi eye: full top lash, three iris rows, one hard white specular.
function paintEye(v, g, t, mirror, dark) {
  const px = (x, y, c) => v.set(mirror ? t.w - 1 - x : x, y, rgb(c));
  const gp = (x, y, c, a) => g.set(mirror ? t.w - 1 - x : x, y, withAlpha(rgb(c), a));
  for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) v.set(x, y, rgb('skin'));
  for (let x = 0; x < t.w; x++) px(x, 0, 'eyeLash');
  if (dark) {
    px(0, 1, 'eyeLash'); px(1, 1, 'eyeOuter'); px(2, 1, 'eyeOuter'); px(3, 1, 'eyeOuter'); px(4, 1, 'eyeLash');
    px(0, 2, 'eyeLash'); px(1, 2, 'eyeOuter'); px(2, 2, 'eyeIris'); px(3, 2, 'eyeOuter'); px(4, 2, 'eyeLash');
    gp(2, 2, 'eyeGlowHi', 210);
  } else {
    px(0, 1, 'eyeLash'); px(1, 1, 'eyeOuter'); px(2, 1, 'eyeIris'); px(3, 1, 'eyeIrisHi'); px(4, 1, 'eyeOuter');
    px(0, 2, 'eyeLash'); px(1, 2, 'eyeIris'); px(2, 2, 'eyeGlowHi'); px(3, 2, 'eyeGlow'); px(4, 2, 'eyeRim');
    gp(2, 2, 'eyeGlowHi', 235); gp(3, 2, 'eyeGlow', 150); gp(3, 1, 'eyeIrisHi', 90);
  }
  px(0, t.h - 1, 'eyeLash');
}

const TILE = {
  hair:       (v, g, t) => material(v, t, { ramp: RAMPS.hair, seed: 11, scale: 2.4, contrast: 1.4 }),
  hair_lit:   (v, g, t) => material(v, t, { ramp: RAMPS.hairLit, seed: 12, scale: 2.2, contrast: 1.35 }),
  hair_tip:   (v, g, t) => material(v, t, { ramp: RAMPS.hairTip, seed: 13, scale: 1.8, contrast: 1.5 }),
  hair_pixel: (v, g, t) => { material(v, t, { ramp: RAMPS.hairPix, seed: 15, scale: 1.0, contrast: 2.1, jitter: 0.25 }); v.outline(0, 0, t.w, t.h, rgb('hairLight')); },
  skin:       (v, g, t) => skinTile(v, t, RAMPS.skin, 21),
  skin_lit:   (v, g, t) => skinTile(v, t, RAMPS.skinLit, 22),
  cloth:      (v, g, t) => clothTile(v, t, RAMPS.cloth, 31),
  cloth_lit:  (v, g, t) => clothTile(v, t, RAMPS.clothLit, 32),
  cloth_band: (v, g, t) => clothTile(v, t, RAMPS.band, 33),
  band:       (v, g, t) => { clothTile(v, t, RAMPS.band, 34); for (let x = 0; x < t.w; x++) v.set(x, 0, rgb('cloth')); },
  cloth_pixel:(v, g, t) => { clothTile(v, t, RAMPS.clothPix, 39); pixelDecor(v, t, ['hairBase', 'clothHi', 'clothMid'], Math.max(1, Math.round(t.w * t.h / 3))); },
  sock:       (v, g, t) => { clothTile(v, t, RAMPS.sock, 37); for (let x = 0; x < t.w; x++) v.blend(x, 0, rgb('cloth'), 0.35); },
  boot:       (v, g, t) => { clothTile(v, t, RAMPS.boot, 35); pixelDecor(v, t, ['clothHi', 'hairLight'], Math.max(1, Math.round(t.w * t.h / 6))); },
  sole:       (v, g, t) => clothTile(v, t, RAMPS.sole, 36),
  gel:        (v, g, t) => gelTile(v, g, t, RAMPS.gel, 41),
  gel_lit:    (v, g, t) => gelTile(v, g, t, RAMPS.gelLit, 42),
  face:       (v, g, t, d) => paintEye(v, g, t, d.mirror, false),
  face_dark:  (v, g, t, d) => paintEye(v, g, t, d.mirror, true),
  brow:       (v, g, t, d) => {
    for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) v.set(x, y, rgb('skin'));
    for (let x = 0; x < t.w; x++) v.set(d.mirror ? t.w - 1 - x : x, 0, rgb(x === 0 ? 'hairDark' : 'hairDeep'));
  },
  brow_angry: (v, g, t, d) => {
    for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) v.set(x, y, rgb('skin'));
    for (let x = 0; x < t.w; x++) v.set(d.mirror ? t.w - 1 - x : x, x === t.w - 1 ? 0 : 0, rgb('hairDark'));
  },
  blush:      (v, g, t, d) => {
    for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) v.set(x, y, rgb('skin'));
    for (let x = 0; x < t.w; x++) v.set(x, 0, rgb(x === 0 ? 'blushHi' : 'blush'));
  },
  mouth:      (v, g, t, d) => {
    for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) v.set(x, y, rgb('skin'));
    const M = (x, y) => v.set(x, y, rgb('mouthDark'));
    if (d.shape === 'happy') { M(0, 0); M(t.w - 1, 0); M(1, 1); M(t.w - 2, 1); }
    else if (d.shape === 'trouble') { M(1, 0); M(Math.max(0, t.w - 2), 0); M(0, 1); M(t.w - 1, 1); }
    else { for (let x = 0; x < t.w; x++) M(x, 0); }
  },
  mouth_o:    (v, g, t) => {
    for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) v.set(x, y, rgb('mouthDark'));
    for (let x = 0; x < t.w; x++) v.set(x, 0, rgb('mouthIn'));
    v.set(0, t.h - 1, rgb('skin')); v.set(t.w - 1, t.h - 1, rgb('skin'));
  },
  swatch:     (v, g, t) => {
    const names = ['clothHi', 'cloth', 'clothMid', 'clothDark', 'clothDeep', 'skin', 'skinMid', 'blush',
      'hairHi', 'hairLight', 'hairBase', 'hairMid', 'hairDark', 'hairDeep', 'sgelHi', 'sgel',
      'sgelMid', 'sgelDark', 'sgelDeep', 'eyeIris', 'eyeGlow', 'mouthDark'];
    for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) v.set(x, y, [10, 14, 22, 255]);
    for (let i = 0; i < names.length; i++) {
      const cx = (i % 4) * 3, cy = Math.floor(i / 4) * 2;
      if (cy + 1 < t.h && cx + 2 < t.w) v.rect(cx, cy, 2, 2, rgb(names[i]));
    }
  },
};

function paint(opts) {
  const { atlas, res } = opts;
  const base = new Canvas(res, res, [12, 16, 24, 255]);
  const glow = new Canvas(res, res);
  for (const t of atlas.list) {
    const v = new TileView(base, t), g = new TileView(glow, t);
    const fn = TILE[t.family];
    if (!fn) throw new Error('no painter for tile family: ' + t.family + ' (' + t.name + ')');
    fn(v, g, t, t.params || {});
  }
  const notes = [
    'base atlas ' + res + 'x' + res + ': ' + atlas.list.length + ' tiles (' + atlas.derived.length + ' auto-sized for an exact 1 texel = 1 unit grid)',
    'glow atlas: only the iris speculars and the bright gel specks are emissive',
  ];
  return { base: base.pixels, glow: glow.pixels, notes: notes };
}

module.exports = paint;
module.exports.TILE = TILE;
module.exports.RAMPS = RAMPS;
