'use strict';
// =====================================================================================
// ACID GEL SLIME — texture painter.  OWNER: lead.
//
// Contract: module.exports = function build(ctx) -> { base, glow, families, notes }
//   base : 128x128 RGBA, every texel opaque, every tile painted with structure.
//   glow : 128x128 RGBA, alpha 0 outside the emissive families, fully painted inside them.
//
// PAINTING STYLE — matched to the reference models in refs/ (SRParasites / phayriosis_two):
// they use a TIGHT palette (8-48 colours over the whole texture) but mottle it densely, with a
// median run length of 1 texel: nearly every texel differs from its neighbour.  This module does
// the same: an ordered Bayer dither between two ramp steps carries every gradient, a per-pixel
// hash grain breaks up the rest, and every tile gets real features (bubbles, pits, wet specks,
// facet lines) instead of a smooth wash.  Colour discipline: every texel is a PALETTE colour or
// shade(PALETTE[name], k/32).
// =====================================================================================
const FONT = {
  A: '.#.|#.#|###|#.#|#.#', B: '##.|#.#|##.|#.#|##.', C: '.##|#..|#..|#..|.##',
  D: '##.|#.#|#.#|#.#|##.', E: '###|#..|##.|#..|###', G: '.##|#..|#.#|#.#|.##',
  H: '#.#|#.#|###|#.#|#.#', I: '###|.#.|.#.|.#.|###', K: '#.#|#.#|##.|#.#|#.#',
  L: '#..|#..|#..|#..|###', M: '#.#|###|###|#.#|#.#', O: '.#.|#.#|#.#|#.#|.#.',
  P: '##.|#.#|##.|#..|#..', R: '##.|#.#|##.|#.#|#.#', S: '.##|#..|.#.|..#|##.',
  T: '###|.#.|.#.|.#.|.#.', U: '#.#|#.#|#.#|#.#|.##', W: '#.#|#.#|###|###|#.#',
  Y: '#.#|#.#|.#.|.#.|.#.', '-': '...|...|###|...|...', ' ': '...|...|...|...|...',
};
const GLOW_FAMILIES = new Set(['eye_glow', 'eye_spark', 'core_glow', 'acid_glow', 'acid_up', 'crystal_glow', 'acid_fleck']);

module.exports = function build(ctx) {
  const { C, atlas, res } = ctx;
  const { rgb, shade, prng, Canvas } = C;
  const SH = (name, k) => shade(name, k / 32);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const round = Math.round;

  // ---- tone ramps (all palette / shade colours, monotonically lighter) ----------------
  const GEL = [
    rgb('gelRim'), rgb('gelShadow'), rgb('gelDeep'), SH('gelDark', -10), rgb('gelDark'),
    SH('gelMidDark', -8), rgb('gelMidDark'), SH('gelMid', -6), rgb('gelMid'), SH('gelMid', 12),
    rgb('gelLight'), rgb('gelWet'), rgb('gelHi'),
  ];
  const ACID = [rgb('acidDark'), rgb('acidDeep'), rgb('acid'), rgb('acidBright'), rgb('acidPale')];
  const XTAL = [rgb('xtalDark'), rgb('xtalMid'), rgb('xtalLight'), rgb('xtalEdge'), rgb('xtalGlow'), rgb('xtalGlowHi')];
  const EYE = [rgb('eyePit'), rgb('eyeDark'), rgb('eyeMid'), rgb('eyeGlass'), rgb('irisTeal'), rgb('irisLime'), rgb('eyeSpark2'), rgb('eyeSpark')];
  const MAW = [rgb('mawDeep'), rgb('mawInner'), SH('mawInner', 8), rgb('mawTongue'), rgb('mawTongueHi')];
  const TOOTH = [rgb('toothEdge'), rgb('toothShade'), rgb('tooth')];
  const gel = (k) => GEL[clamp(round(k), 0, GEL.length - 1)];
  const acid = (k) => ACID[clamp(round(k), 0, ACID.length - 1)];
  const xtal = (k) => XTAL[clamp(round(k), 0, XTAL.length - 1)];
  const eye = (k) => EYE[clamp(round(k), 0, EYE.length - 1)];
  const mawc = (k) => MAW[clamp(round(k), 0, MAW.length - 1)];
  const tooth = (k) => TOOTH[clamp(round(k), 0, TOOTH.length - 1)];
  const lightOf = (t, d) => (t.params && typeof t.params.light === 'number' ? t.params.light : d);

  // ---- pixel-art texture tools ---------------------------------------------------------
  // deterministic per-texel hash (no Math.random: rebuilds stay byte-identical)
  function hash(x, y, s) {
    let n = (x * 374761393 + y * 668265263 + s * 1274126177) | 0;
    n = (n ^ (n >>> 13)) | 0; n = (n * 1274126177) | 0;
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  }
  const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
  const bay4 = (x, y) => (BAYER[y & 3][x & 3] + 0.5) / 16;   // classic ordered dither threshold
  // Thin tiles (most of the dome is 1-4 texels tall) cannot use a 4-row Bayer: the pattern
  // degenerates into whole-row banding, which is exactly the smooth smear we are trying to avoid.
  // Mixing the two coordinates into a 9-step sequence keeps every 1-2 texels stepping.
  const bayThin = (x, y) => (((x * 5 + y * 7) % 9) + 0.5) / 9;
  const bay = (x, y, h) => (h !== undefined && h <= 4 ? bayThin(x, y) : bay4(x, y));

  // ---- pen: bounds-checked drawing inside a tile ---------------------------------------
  function pen(view, w, h, seed) {
    const P = {
      w, h, view, seed,
      px(x, y, c) { if (x < 0 || y < 0 || x >= w || y >= h) return; view.set(x, y, c); },
      row(y, x0, x1, c) { for (let x = x0; x <= x1; x++) P.px(x, y, c); },
      col(x, y0, y1, c) { for (let y = y0; y <= y1; y++) P.px(x, y, c); },
      box(x, y, ww, hh, c) { for (let yy = y; yy < y + hh; yy++) for (let xx = x; xx < x + ww; xx++) P.px(xx, yy, c); },
      outline(c) { P.row(0, 0, w - 1, c); P.row(h - 1, 0, w - 1, c); P.col(0, 0, h - 1, c); P.col(w - 1, 0, h - 1, c); },
      circle(cx, cy, r, c) { for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) P.px(x, y, c); },
      poly(pts, c) { view.fillPoly(pts, c); },
      /** dithered vertical ramp: kTop -> kBot carried by a Bayer dither + per-texel grain */
      ramp(y0, y1, kTop, kBot, put, grain = 0.55) {
        const rows = Math.max(1, y1 - y0 + 1);
        for (let yy = y0; yy <= y1; yy++) for (let xx = 0; xx < w; xx++) {
          const t = rows > 1 ? (yy - y0) / (rows - 1) : 0;
          const thin = rows <= 4 ? 1.35 : 1;
          const k = kTop + (kBot - kTop) * t + (bay(xx, yy, h) - 0.5) * 0.95 * thin + (hash(xx, yy, P.seed) - 0.5) * grain * thin;
          put(xx, yy, k);
        }
      },
      /** a bit of gel grit: bright specks and dark pits, deterministic per tile */
      grit(n, kBase, spread = 4) {
        for (let i = 0; i < n; i++) {
          const x = Math.floor(hash(i, 1, P.seed + 7) * w), y = Math.floor(hash(i, 2, P.seed + 11) * h);
          const bright = hash(i, 3, P.seed + 13) > 0.45;
          P.px(x, y, gel(kBase + (bright ? 1 + spread * 0.5 : -spread * 0.4) * (0.5 + hash(i, 4, P.seed) * 0.5)));
        }
      },
      // 3x3 gel bubble: bright upper-left arc, softened lower-right, glassy middle
      bubble3(x, y, k) {
        P.px(x + 1, y, gel(k + 3)); P.px(x, y + 1, gel(k + 3)); P.px(x + 1, y + 1, gel(k - 1));
        P.px(x + 2, y + 1, gel(k + 1)); P.px(x + 1, y + 2, gel(k + 1));
        P.px(x + 2, y, gel(k + 1)); P.px(x, y + 2, gel(k + 1));
      },
      streak(x, y0, y1, k) { P.col(x, y0, y1, gel(k + 2)); P.px(x, y0, gel(k + 4)); },
    };
    return P;
  }

  // The untouched canvas is a distinct 'nothing here' colour on purpose: the 13-step gel ramp
  // contains the palette's gelMid at index 8, so filling with gelMid made correctly painted
  // tiles indistinguishable from unpainted ones (a false alarm for the verifier too).
  const base = new Canvas(res, res, rgb('void'));
  const glow = new Canvas(res, res, [0, 0, 0, 0]);
  const painters = {};

  // ---- unused faces + the thin creases between stacked layers -------------------------
  // the void tile must not equal the canvas base colour, or it reads as 'unpainted'
  painters.void = function (p) { p.P.px(0, 0, SH('void', 14)); };

  painters.seam = function (p) {
    const { P } = p, w = P.w, h = P.h;
    P.ramp(0, h - 1, 1.4, 0.0, (x, y, k) => P.px(x, y, gel(k)), 0.9);
    P.px(0, 0, gel(0)); P.px(w - 1, 0, gel(0)); P.px(w - 1, h - 1, gel(0));
    P.px(Math.floor(w / 2), 1, SH('gelRim', -10));
    P.px(Math.min(w - 1, 1), h - 1, gel(1));
  };

  // =====================================================================================
  // gel — the body.  Every tile is a dithered ramp plus real features; nothing is a wash.
  // =====================================================================================
  painters.gel_side = function (p) {
    const { P, t, r } = p, w = P.w, h = P.h;
    const light = lightOf(t, 0.3), part = (t.params && t.params.part) || 'dome';
    const kc = light * (GEL.length - 1);
    const R = (y0, y1, a, b) => P.ramp(y0, y1, a, b, (x, y, k) => P.px(x, y, gel(k)));

    if (part === 'skirt') {
      // wet ground puddle: bright waterline, dark contact shadow, dense mottling, drips
      R(0, h - 1, kc + 1.1, kc - 1.3, 0.85);
      P.row(0, 0, w - 1, gel(kc + 2.4));
      P.row(0, 1, w - 2, gel(kc + 3.0));
      for (let i = 0; i < Math.max(2, Math.round(w / 4)); i++) {
        const x = Math.floor(hash(i, 1, P.seed) * w);
        P.col(x, 0, Math.max(1, h - 3), gel(kc + 1.6)); P.px(x, 0, gel(kc + 3.2));
      }
      P.row(h - 1, 0, w - 1, gel(kc - 3.2));
      P.row(Math.max(1, h - 2), 0, w - 1, gel(kc - 2.0));
      for (let i = 0; i < Math.max(1, Math.round(w / 5)); i++) P.bubble3(1 + Math.floor(hash(i, 5, P.seed) * Math.max(1, w - 4)), Math.max(1, h - 4), kc);
      P.grit(Math.max(3, Math.round(w * 0.5)), kc, 4);
      return;
    }
    if (part === 'drip') {
      R(0, h - 1, kc + 0.9, kc - 1.6, 0.7);
      P.col(0, 0, h - 1, gel(kc - 1.2)); P.col(w - 1, 0, h - 1, gel(kc - 1.2));
      P.col(Math.min(w - 1, 1), 0, h - 1, gel(kc + 1.8)); P.px(Math.min(w - 1, 1), 0, gel(kc + 3.4));
      P.px(0, h - 1, gel(kc - 2.6)); P.px(w - 1, h - 1, gel(kc - 2.6));
      P.grit(2, kc, 3);
      return;
    }
    if (part === 'lobe') {
      R(0, h - 1, kc + 1.0, kc - 1.4, 0.6);
      P.row(0, 1, w - 2, gel(kc + 1.9));
      P.px(1, 0, gel(kc + 3.2)); P.px(w - 2, 0, gel(kc + 2.6));
      P.row(h - 1, 0, w - 1, gel(kc - 2.2));
      P.col(0, 1, h - 1, gel(kc - 0.8)); P.col(w - 1, 1, h - 1, gel(kc - 0.8));
      P.bubble3(1 + Math.floor(r() * Math.max(1, w - 4)), Math.max(1, h - 3), kc - 0.5);
      P.grit(3, kc, 4);
      return;
    }
    if (part === 'knob') {
      R(0, h - 1, kc + 1.0, kc - 1.0, 0.5);
      P.box(1, 0, Math.max(1, w - 2), Math.max(1, Math.floor(h / 2)), gel(kc + 1.4));
      P.px(1, 1, GEL[GEL.length - 2]); P.px(2, 0, GEL[GEL.length - 1]); P.px(2, 1, gel(kc + 2.6));
      P.row(h - 1, 0, w - 1, gel(kc - 1.8));
      P.col(0, 0, h - 1, gel(kc - 0.6)); P.col(w - 1, 0, h - 1, gel(kc - 0.6));
      P.grit(4, kc, 3);
      return;
    }
    if (part === 'antenna') {
      R(0, h - 1, kc + 0.8, kc - 1.2, 0.4);
      P.col(Math.min(w - 1, 1), 0, h - 1, gel(kc + 1.8));
      P.px(1, 0, gel(kc + 3.0)); P.col(0, 0, h - 1, gel(kc - 1.0)); P.col(w - 1, 0, h - 1, gel(kc - 1.0));
      return;
    }
    // dome / lid / streak: the layer gradient, carried by the dither, plus wet life
    R(0, h - 1, kc + 0.75, kc - 0.75, 0.55);
    P.row(0, 0, w - 1, gel(kc + 1.3));
    P.row(h - 1, 0, w - 1, gel(kc - 1.4));
    P.col(0, 1, h - 1, gel(kc - 0.9));
    P.col(w - 1, 1, h - 1, gel(kc - 1.1));
    // wet highlight streaks up high, bubbles down low
    if (light > 0.42 && w >= 5) {
      const n = 1 + Math.floor(hash(0, 9, P.seed) * 2);
      for (let i = 0; i < n; i++) {
        const x = 1 + Math.floor(hash(i, 8, P.seed) * (w - 2));
        P.px(x, 0, gel(kc + 3.4)); P.px(x, 1, gel(kc + 2.2));
        if (hash(i, 12, P.seed) > 0.5) P.px(x, 2, gel(kc + 1.2));
      }
    }
    if (light < 0.55 && w >= 7 && h >= 3) {
      const bx = 1 + Math.floor(hash(3, 6, P.seed) * (w - 4));
      P.bubble3(bx, h - 3, kc + 0.4);
      if (w >= 12) P.bubble3(Math.min(w - 4, bx + 5), Math.max(0, h - 4), kc + 0.4);
    }
    P.grit(Math.max(2, Math.round(w * 0.35)), kc, 4);
  };

  painters.gel_up = function (p) {
    const { P, t } = p, w = P.w, h = P.h;
    const part = (t.params && t.params.part) || 'dome';
    let light = lightOf(t, 0.85);
    if (part === 'skirt') light = Math.max(0, light - 0.45);
    const kc = light * (GEL.length - 1) + 0.8;
    if (h === 1) {   // single-row ridge (lip/knob tops): per-texel sheen, never flat
      const bits = [9, 11, 10, 12, 10, 11, 9, 12];
      for (let x = 0; x < w; x++) P.px(x, 0, gel(bits[x % bits.length] - 2 + lightOf(t, 0.6) * 4));
      P.px(0, 0, gel(kc - 4)); P.px(w - 1, 0, gel(kc - 4));
      return;
    }
    if (part === 'skirt') {
      // dark wet pool with the body reflected in it
      P.ramp(0, h - 1, kc - 3.0, kc - 4.2, (x, y, k) => P.px(x, y, gel(k)), 0.9);
      const cx = (w - 1) / 2;
      for (let y = 0; y < h; y++) {
        const half = Math.max(1, Math.floor((h - y) / 2.2));
        for (let x = Math.max(0, cx - half); x <= Math.min(w - 1, cx + half); x++) {
          const k = kc - 2.4 + (h - y) * 0.12 + (bay(x, y) - 0.5) * 0.9;
          P.px(x, y, gel(k));
        }
      }
      P.col(0, 0, h - 1, gel(kc - 4.6)); P.col(w - 1, 0, h - 1, gel(kc - 4.6));
      P.row(h - 1, 0, w - 1, gel(kc - 4.8));
      for (let i = 0; i < Math.max(2, Math.round(w / 4)); i++) {
        const bx = 1 + Math.floor(hash(i, 2, P.seed) * Math.max(1, w - 4));
        const by = 1 + Math.floor(hash(i, 3, P.seed) * Math.max(1, h - 4));
        P.bubble3(bx, by, kc - 3.0);
      }
      P.px(1, 0, gel(kc - 1.4)); P.px(w - 2, 1, gel(kc - 1.8));
      P.grit(Math.round(w * 0.4), kc - 3, 4);
      return;
    }
    // glossy top: dithered bright surface, specular blobs, darker outer curve
    P.ramp(0, h - 1, kc + 1.0, kc - 1.4, (x, y, k) => P.px(x, y, gel(k)), 0.6);
    P.row(0, 1, w - 2, gel(kc + 1.9));
    P.row(h - 1, 0, w - 1, gel(kc - 2.2));
    P.col(0, 0, h - 1, gel(kc - 0.9)); P.col(w - 1, 0, h - 1, gel(kc - 1.3));
    const blobs = (w >= 8 && h >= 6) ? 2 : 1;
    for (let i = 0; i < blobs; i++) {
      const bx = 1 + Math.floor(hash(i, 4, P.seed) * Math.max(1, w - 4));
      const by = 1 + Math.floor(hash(i, 5, P.seed) * Math.max(1, h - 3));
      P.box(bx, by, Math.min(2, w - bx - 1), Math.min(2, h - by - 1), gel(kc + 2.6));
      P.px(bx, by, GEL[GEL.length - 1]);
      P.px(bx + 1, by, gel(kc + 2.0));
    }
    if (w >= 7 && h >= 4) P.bubble3(1 + Math.floor(hash(6, 7, P.seed) * (w - 4)), h - 3, kc - 1.4);
    P.grit(Math.max(2, Math.round(w * 0.3)), kc, 3);
  };

  painters.gel_down = function (p) {
    const { P } = p, w = P.w, h = P.h;
    P.ramp(0, h - 1, 1.4, 0.6, (x, y, k) => P.px(x, y, gel(k)), 0.9);
    P.outline(gel(0));
    const cx = (w - 1) / 2, cy = (h - 1) / 2;
    P.circle(cx, cy, Math.max(1.2, Math.min(w, h) / 2 - 0.6), gel(2.4));
    P.circle(cx, cy, Math.max(0.8, Math.min(w, h) / 4), gel(3.2));
    for (let i = 0; i < 5; i++) {
      const bx = 1 + Math.floor(hash(i, 1, P.seed) * Math.max(1, w - 4));
      const by = 1 + Math.floor(hash(i, 2, P.seed) * Math.max(1, h - 4));
      P.bubble3(bx, by, 2.5);
    }
    for (let i = 0; i < 3; i++) {
      const x = 2 + i * 4;
      if (x < w) { P.col(x, 0, Math.max(2, Math.floor(h / 3)), gel(1.6)); P.px(x, 1, gel(3.2)); }
    }
    P.grit(Math.max(3, Math.round(w * h * 0.12)), 2.2, 4);
  };

  painters.gel_lid = function (p) {
    const { P } = p, w = P.w, h = P.h;
    P.ramp(0, h - 1, 9.6, 4.4, (x, y, k) => P.px(x, y, gel(k)), 0.7);
    P.row(0, 0, w - 1, gel(10.2));
    P.px(1, 0, GEL[GEL.length - 1]); P.px(2, 0, gel(11.2)); P.px(w - 2, 0, gel(9.4));
    P.col(0, 1, h - 1, gel(5.6)); P.col(w - 1, 1, h - 1, gel(5.0));
    if (h > 1) P.row(h - 1, 0, w - 1, gel(3.8));
    P.grit(Math.max(1, Math.round(w * 0.4)), 7, 4);
  };

  painters.gel_streak = function (p) {
    const { P } = p;
    P.ramp(0, P.h - 1, 10.4, 3.6, (x, y, k) => P.px(x, y, gel(k)), 0.8);
    P.col(1, 0, P.h - 1, gel(11.4));
    P.col(P.w - 1, 0, P.h - 1, gel(5.0));
    P.grit(Math.max(2, Math.round(P.w * P.h * 0.2)), 8, 4);
  };

  // =====================================================================================
  // eyes — the cute focal point: dark mottled socket, hot iris, hard speculars
  // =====================================================================================
  painters.eye = function (p) {
    const { P } = p, w = P.w, h = P.h;
    P.ramp(0, h - 1, 2.6, 1.0, (x, y, k) => P.px(x, y, eye(k)), 0.8);
    for (let y = 1; y < h - 1; y++) P.row(y, 1, w - 2, eye(0));
    P.px(0, 0, eye(3)); P.px(w - 1, 0, eye(3)); P.px(1, 0, eye(3));
    P.row(h - 1, 1, w - 2, SH('irisTeal', -18));       // the iris light bouncing inside the socket
    P.px(0, h - 2, SH('irisTeal', -22)); P.px(w - 1, h - 2, SH('irisTeal', -22));
    P.px(1, h - 2, eye(2)); P.px(w - 2, h - 2, eye(2));
    P.px(w - 2, 1, eye(1)); P.px(1, 1, eye(1));
  };

  painters.eye_glow = function (p) {   // 3x3 iris: teal glow disc, lime upper-left, 2 speculars
    for (const Q of [p.P, p.G]) {
      Q.px(0, 0, eye(6)); Q.px(1, 0, eye(6)); Q.px(2, 0, eye(4));
      Q.px(0, 1, eye(5)); Q.px(1, 1, eye(7)); Q.px(2, 1, eye(4));
      Q.px(0, 2, eye(4)); Q.px(1, 2, eye(4)); Q.px(2, 2, eye(3));
    }
  };

  painters.eye_spark = function (p) {   // 2x2; only texel (0,0) is sampled by the 1x1 spark faces
    for (const Q of [p.P, p.G]) {
      Q.px(0, 0, eye(7)); Q.px(1, 0, eye(6));
      Q.px(0, 1, eye(6)); Q.px(1, 1, SH('eyeSpark2', -8));
    }
  };

  // =====================================================================================
  // brow / mouth / maw — dark, bitten, wet
  // =====================================================================================
  painters.brow = function (p) {
    const { P } = p, w = P.w, h = P.h;
    P.ramp(0, h - 1, 4.4, 0.6, (x, y, k) => P.px(x, y, gel(k)), 0.8);
    P.row(0, 1, w - 2, gel(4.6));
    P.px(Math.floor(w / 2), 0, gel(5.4)); P.px(2, 0, gel(5.0));
    P.col(0, 0, h - 1, gel(1.2)); P.col(w - 1, 0, h - 1, gel(1.2));
    if (h > 1) P.row(h - 1, 0, w - 1, gel(0.4));
  };

  painters.lip = function (p) {
    const { P } = p, w = P.w, h = P.h;
    const kc = 4.6;
    P.ramp(0, h - 1, kc + 0.7, kc - 1.3, (x, y, k) => P.px(x, y, gel(k)), 0.7);
    P.row(0, 2, Math.max(2, w - 3), gel(kc + 2.6));      // wet gleam above the smile
    P.px(Math.floor(w / 2), 0, gel(kc + 3.4));
    const line = rgb('lipLine'), dimple = rgb('lipDark');
    P.px(0, 1, dimple); P.px(w - 1, 1, dimple);
    P.row(h > 2 ? 2 : 1, 1, w - 2, line);
    P.px(1, 1, line); P.px(w - 2, 1, line);
    if (h > 2) P.px(Math.floor(w / 2), 2, line);
    P.col(0, 0, h - 1, dimple); P.col(w - 1, 0, h - 1, dimple);
    if (h > 2) P.row(h - 1, 1, w - 2, gel(kc - 2.0));
  };

  painters.tooth = function (p) {
    const { P, t } = p;
    const big = !(t.params && t.params.size === 'small');
    P.px(0, 0, big ? tooth(2) : SH('tooth', -6)); P.px(1, 0, tooth(1));
    P.px(0, 1, tooth(1)); P.px(1, 1, tooth(0));
  };

  painters.maw = function (p) {
    const { P } = p, w = P.w, h = P.h;
    P.ramp(0, h - 1, 2.8, 0.0, (x, y, k) => P.px(x, y, mawc(k)), 0.9);
    P.row(0, 0, w - 1, mawc(3));
    P.px(2, 1, rgb('mawTongueHi')); P.px(Math.max(1, w - 3), Math.max(1, h - 2), SH('mawTongueHi', -8));
    P.px(Math.max(0, w - 5), 1, SH('mawTongue', -8));
    P.col(0, 0, h - 1, mawc(0)); P.col(w - 1, 0, h - 1, mawc(0));
    P.row(h - 1, 0, w - 1, mawc(0));
    P.grit(Math.max(2, Math.round(w * 0.4)), 1.6, 3);
  };

  painters.maw_floor = function (p) {
    const { P } = p, w = P.w, h = P.h;
    P.ramp(0, h - 1, 4.2, 1.0, (x, y, k) => P.px(x, y, mawc(k)), 0.8);
    P.px(1, 0, SH('mawTongueHi', 6)); P.px(Math.floor(w / 2), 0, rgb('mawTongueHi'));
    P.col(0, 0, h - 1, mawc(0)); P.col(w - 1, 0, h - 1, mawc(0));
  };

  painters.tongue = function (p) {
    const { P } = p, w = P.w, h = P.h;
    P.ramp(0, h - 1, 4.3, 2.2, (x, y, k) => P.px(x, y, mawc(k)), 0.8);
    P.row(0, 1, w - 2, SH('mawTongueHi', 4));
    P.px(1, 0, rgb('mawTongueHi')); P.px(w - 2, 0, rgb('mawTongueHi'));
    P.col(0, 0, h - 1, SH('mawTongue', -12)); P.col(w - 1, 0, h - 1, SH('mawTongue', -12));
    if (h > 1) P.row(h - 1, 0, w - 1, SH('mawTongue', -14));
  };
  painters.tongue_up = function (p) {
    const { P } = p, w = P.w, h = P.h;
    P.ramp(0, h - 1, 4.6, 3.0, (x, y, k) => P.px(x, y, mawc(k)), 0.7);
    P.box(1, 0, Math.max(1, w - 2), 1, SH('mawTongueHi', 6));
    P.grit(2, 3.4, 3);
  };

  // =====================================================================================
  // acid core / glow — faceted, hot, speckled
  // =====================================================================================
  painters.core = function (p) {
    const { P } = p, w = P.w, h = P.h;
    if (h === 1) {
      for (let x = 0; x < w; x++) {
        const warm = 1 - Math.abs(x - (w - 1) / 2) / Math.max(1, w / 2);
        P.px(x, 0, acid(0.6 + warm * 3.0 + (bay(x, 0) - 0.5)));
      }
      P.px(0, 0, acid(0)); P.px(w - 1, 0, acid(0));
      return;
    }
    // faceted gem: bright upper facet, dark bezel, dithered inside
    P.ramp(0, h - 1, 3.6, 1.0, (x, y, k) => P.px(x, y, acid(k)), 0.7);
    P.row(0, 0, w - 1, acid(1.6));
    P.row(0, 1, w - 2, acid(3.4));
    if (w > 5) P.row(0, 2, w - 3, acid(4));
    P.px(0, 0, acid(0.4)); P.px(w - 1, 0, acid(0.4));
    P.col(0, 0, h - 1, acid(0)); P.col(w - 1, 0, h - 1, acid(0));
    P.px(Math.max(1, Math.floor(w / 2) - 1), 0, SH('acidPale', 10));
    if (h > 1) { P.px(1, 1, acid(3)); P.px(w - 2, 1, acid(2)); }
    P.grit(Math.max(1, Math.round(w * 0.4)), 2.4, 4);
  };
  painters.core_up = function (p) {
    const { P } = p, w = P.w, h = P.h;
    for (let x = 0; x < w; x++) {
      const warm = 1 - Math.abs(x - (w - 1) / 2) / Math.max(1, w / 2);
      for (let y = 0; y < h; y++) P.px(x, y, acid(2 + warm * 2 - y * 0.8 + (bay(x, y) - 0.5) * 0.9));
    }
    P.px(Math.max(1, Math.floor(w / 2) - 1), 0, SH('acidPale', 10));
    P.col(0, 0, h - 1, acid(1)); P.col(w - 1, 0, h - 1, acid(1));
  };
  painters.core_glow = function (p) {
    for (const Q of [p.P, p.G]) {
      for (let x = 0; x < Q.w; x++) {
        const warm = 1 - Math.abs(x - (Q.w - 1) / 2) / Math.max(1, Q.w / 2);
        Q.px(x, 0, acid(3 + warm * 1.6));
        if (Q.h > 1) Q.px(x, Q.h - 1, acid(2.2 + warm));
      }
      Q.px(Math.max(1, Math.floor(Q.w / 2) - 1), 0, SH('acidPale', 12));
      Q.col(0, 0, Q.h - 1, acid(2)); Q.col(Q.w - 1, 0, Q.h - 1, acid(2));
    }
  };
  painters.acid_glow = function (p) {   // bulb / bead: hot core, cooled rim
    for (const [Q, boost] of [[p.P, 0], [p.G, 1]]) {
      for (let y = 0; y < Q.h; y++) for (let x = 0; x < Q.w; x++) {
        const d = Math.hypot(x - (Q.w - 1) / 2, y - (Q.h - 1) / 2) / Math.max(1, Math.min(Q.w, Q.h) / 2);
        Q.px(x, y, acid(3.6 + boost - d * 2.6 + (bay(x, y) - 0.5) * 0.9));
      }
      Q.px(1, 1, acid(4)); Q.px(2, 1, SH('acidPale', 6));
      Q.col(0, 0, Q.h - 1, acid(0.6)); Q.row(Q.h - 1, 0, Q.w - 1, acid(0.6));
    }
  };
  painters.acid_up = function (p) {
    for (const Q of [p.P, p.G]) {
      for (let y = 0; y < Q.h; y++) for (let x = 0; x < Q.w; x++) {
        Q.px(x, y, acid(3.0 - y * 0.7 + (bay(x, y) - 0.5) * 0.9));
      }
      Q.px(Math.max(1, Math.floor(Q.w / 2) - 1), 1, acid(4));
      Q.outline(acid(0));
    }
  };
  painters.acid_fleck = function (p) {
    for (const Q of [p.P, p.G]) {
      for (let y = 0; y < Q.h; y++) for (let x = 0; x < Q.w; x++) Q.px(x, y, acid(1.4 + (bay(x, y) - 0.5) * 0.8));
      Q.px(0, 0, acid(4)); Q.px(1, 1, acid(3)); Q.px(2, 0, acid(2));
      Q.px(Q.w - 1, Q.h - 1, acid(3)); Q.px(Q.w - 2, Q.h - 1, acid(2));
    }
  };

  // =====================================================================================
  // crystals — obsidian facets, a lit edge, a mint glow crack, dense speckle
  // =====================================================================================
  painters.crystal = function (p) {
    const { P, t } = p, w = P.w, h = P.h;
    const light = lightOf(t, 0.45);
    P.ramp(0, h - 1, 0.6 + light, 0.2 + light, (x, y, k) => P.px(x, y, xtal(k)), 0.7);
    P.col(0, 0, h - 1, xtal(3));                     // lit facet edge
    P.col(1, 0, h - 1, xtal(2.2));
    if (w > 2) P.col(2, 0, h - 1, xtal(1.4));
    P.row(0, 0, w - 1, xtal(3.4));                   // the tip catches the light
    P.row(1, 1, Math.max(1, w - 2), xtal(2.6));
    P.col(w - 1, 0, h - 1, xtal(0.2));               // shadow side
    P.row(h - 1, 0, w - 1, xtal(0));
    // glow crack zig-zagging up the facet, with a hot core
    let x = Math.max(1, w - 2);
    for (let y = h - 1; y >= 0; y--) {
      P.px(x, y, xtal(4));
      if ((h - y) % 2 === 0) { x = clamp(x + 1, 1, w - 1); P.px(x, y, xtal(5)); } else x = clamp(x - 1, 0, w - 1);
    }
    P.px(0, 0, xtal(5));
    P.px(Math.max(1, w - 3), Math.max(0, h - 2), xtal(2.6));
    P.px(1, Math.max(1, h - 3), xtal(1.8));
    P.grit(Math.max(2, Math.round(w * h * 0.18)), 0.8 + light, 3);
  };
  painters.crystal_top = function (p) {
    const { P } = p, w = P.w, h = P.h;
    P.ramp(0, h - 1, 3.0, 1.4, (x, y, k) => P.px(x, y, xtal(k)), 0.7);
    P.poly([[0, 0], [w - 1, 0], [Math.floor(w / 2), h - 1]], xtal(3.2));
    P.px(1, 1, xtal(4)); P.px(Math.max(0, w - 2), 1, xtal(2.4));
    P.outline(xtal(0.6));
    P.px(Math.floor(w / 2), 0, xtal(5));
  };
  painters.crystal_glow = function (p) {
    for (const Q of [p.P, p.G]) {
      Q.ramp(0, Q.h - 1, 4.6, 3.4, (x, y, k) => Q.px(x, y, xtal(k)), 0.6);
      Q.px(0, 0, xtal(5)); Q.px(1, 1, xtal(5)); Q.px(Q.w - 1, Q.h - 1, xtal(3));
      if (Q.w > 2) Q.px(Q.w - 2, 0, xtal(4.6));
    }
  };

  // =====================================================================================
  // paint every tile
  // =====================================================================================
  for (const t of atlas.list) {
    const painter = painters[t.family];
    if (!painter) throw new Error('no painter for tile family "' + t.family + '" (tile ' + t.name + ')');
    const seed = (() => { let s = 0; for (const ch of t.name) s = (s * 31 + ch.charCodeAt(0)) >>> 0; return s || 1; })();
    const p = {
      t, w: t.w, h: t.h, r: prng('slime:' + t.name),
      P: pen(new C.TileView(base, t), t.w, t.h, seed),
      G: pen(new C.TileView(glow, t), t.w, t.h, seed + 977),
    };
    painter(p);
  }

  // =====================================================================================
  // swatch board in the free space (never touches a tile, 1px gutter all around)
  // =====================================================================================
  {
    const claimed = atlas.coverage();
    const blocked = new Set();
    for (const k of claimed.keys()) {
      const x = k % res, y = (k - x) / res;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < res && ny < res) blocked.add(ny * res + nx);
      }
    }
    const free = (x, y) => x >= 0 && y >= 0 && x < res && y < res && !blocked.has(y * res + x);
    const px = (x, y, c) => { if (free(x, y)) base.set(x, y, c); };
    const box = (x, y, w, h, c) => { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) px(xx, yy, c); };
    const outline = (x, y, w, h, c) => { for (let xx = 0; xx < w; xx++) { px(x + xx, y, c); px(x + xx, y + h - 1, c); } for (let yy = 0; yy < h; yy++) { px(x, y + yy, c); px(x + w - 1, y + yy, c); } };
    const text = (x, y, str, c) => {
      let cx = x;
      for (const ch of str.toUpperCase()) {
        const g = FONT[ch] || FONT[' '];
        const rowsG = g.split('|');
        for (let ry = 0; ry < rowsG.length; ry++) for (let rx = 0; rx < rowsG[ry].length; rx++) if (rowsG[ry][rx] === '#') px(cx + rx, y + ry, c);
        cx += 4;
      }
    };
    const card = (cx, cy, w, h, label) => {
      box(cx, cy, w, h, SH('gelShadow', -8));
      outline(cx, cy, w, h, SH('gelRim', -6));
      if (label) text(cx + 2, cy + 2, label, rgb('gelWet'));
      return { x: cx + 2, y: cy + (label ? 9 : 2), w: w - 4, h: h - (label ? 11 : 4) };
    };
    let top = 0;
    for (const t of atlas.list) top = Math.max(top, t.y + t.h);
    let ly = top + 2;

    // --- gel tone ramp: 13 dithered chips so the dither pattern is reusable by hand
    text(0, ly, 'GEL RAMP', rgb('gelWet'));
    ly += 7;
    for (let i = 0; i < GEL.length; i++) {
      const cx = i * 9;
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        const k = i + (bay(x, y, 8) - 0.5) * 0.9 + (hash(x, y, i * 31 + 5) - 0.5) * 0.5;
        box(cx + x, ly + y, 1, 1, GEL[clamp(round(k), 0, GEL.length - 1)]);
      }
    }
    ly += 10;
    for (let x = 0; x < res; x++) {                      // continuous dithered ramp strip
      const k = (x / (res - 1)) * (GEL.length - 1);
      for (let y = 0; y < 3; y++) px(x, ly + y, GEL[clamp(round(k + (bay(x, y, 3) - 0.5) * 0.9), 0, GEL.length - 1)]);
    }
    ly += 5;

    // --- assembled references (straight copies of the painted tiles)
    text(0, ly, 'DOME', rgb('gelWet'));
    text(21, ly, 'FACE', rgb('gelWet'));
    ly += 7;
    const stack = [['gel_L1_long', 18, 4], ['gel_L2_long', 17, 3], ['gel_L3_long', 15, 3], ['gel_L4_long', 13, 2],
                   ['gel_L5_long', 10, 2], ['gel_L6_long', 8, 2], ['gel_L7_long', 5, 1]];
    let sy = ly + 16;
    for (const [name, w, h] of stack) {
      const t = atlas.get(name);
      base.copyRect(t.x, t.y, w, h, 0, sy);
      sy -= h;
    }
    const put = (name, dx, dy2, w, h) => { const t = atlas.get(name); base.copyRect(t.x, t.y, Math.min(w, t.w), Math.min(h, t.h), dx, dy2); };
    put('brow_dark', 21, ly, 5, 2);
    put('eye_lid', 21, ly + 4, 4, 2);
    put('eye_sclera', 21, ly + 7, 4, 4);
    put('eye_iris', 21, ly + 8, 3, 3);
    put('eye_spark', 26, ly + 8, 1, 1);
    put('lip_grin', 21, ly + 13, 7, 3);
    put('fang_up', 24, ly + 16, 2, 2);
    put('maw_inner', 21, ly + 19, 7, 3);
    put('tongue', 21, ly + 24, 5, 3);
    put('core_gem', 29, ly + 7, 6, 2);
    put('xtal_a', 29, ly + 11, 4, 6);
    put('xtal_tip', 30, ly + 18, 2, 2);
    put('acid_bulb', 31, ly + 22, 4, 4);
    ly += 30;

    // --- texture cards: how the dither + mottling should look at scale
    const c1 = card(0, ly, 22, 20, 'BUBBLE');
    for (let i = 0; i < 4; i++) {
      const bx = c1.x + (i % 2) * 7, by = c1.y + Math.floor(i / 2) * 6;
      for (let y = 0; y < 5; y++) for (let x = 0; x < 6; x++) box(bx + x, by + y, 1, 1, GEL[clamp(round(4 + (bay(x, y) - 0.5)), 0, 12)]);
      box(bx + 1, by + 1, 4, 3, GEL[2]);
      box(bx + 2, by + 2, 2, 1, GEL[7]);
    }
    const c2 = card(24, ly, 22, 20, 'DRIP');
    for (let y = 0; y < 16; y++) for (let x = 0; x < 8; x++) box(c2.x + x, c2.y + y, 1, 1, GEL[clamp(round(2.4 + 1.6 * Math.sin(y / 3) + (bay(x, y) - 0.5)), 0, 12)]);
    box(c2.x + 3, c2.y + 10, 2, 4, GEL[6]);
    box(c2.x + 1, c2.y + 13, 6, 3, GEL[7]);
    const c3 = card(48, ly, 22, 20, 'SKIRT');
    for (let y = 0; y < 16; y++) for (let x = 0; x < 18; x++) box(c3.x + x, c3.y + y, 1, 1, GEL[clamp(round(1.2 + 1.4 * (1 - y / 15) + (bay(x, y) - 0.5) * 0.9), 0, 12)]);
    box(c3.x, c3.y + 14, 18, 2, GEL[0]);
    for (let i = 0; i < 5; i++) box(c3.x + 1 + i * 3, c3.y + 3, 2, 11, GEL[2]);
    const c4 = card(72, ly, 22, 20, 'XTAL');
    for (let y = 0; y < 16; y++) for (let x = 0; x < 18; x++) box(c4.x + x, c4.y + y, 1, 1, XTAL[clamp(round(0.8 + (bay(x, y) - 0.5) * 0.9), 0, 5)]);
    for (let i = 0; i < 3; i++) { box(c4.x + 1 + i * 6, c4.y + 2, 4, 12, XTAL[2]); box(c4.x + 2 + i * 6, c4.y + 3, 1, 9, XTAL[4]); }
    const c5 = card(96, ly, 28, 20, 'ACID');
    for (let i = 0; i < 5; i++) { box(c5.x + i * 5, c5.y + 8, 4, 8, ACID[i]); box(c5.x + i * 5, c5.y, 4, 6, GEL[i * 2.6]); }
    ly += 22;

    // --- palette grid: every named colour in tools/lib/canvas.js
    text(0, ly, 'PALETTE', rgb('gelWet'));
    ly += 7;
    const names = Object.keys(C.PALETTE);
    names.forEach((n, i) => {
      const cx = (i % 21) * 6, cy = ly + Math.floor(i / 21) * 6;
      box(cx, cy, 5, 5, rgb(n));
      px(cx, cy, SH(n, 10)); px(cx + 4, cy + 4, SH(n, -10));
    });
  }

  return {
    base: base.pixels,
    glow: glow.pixels,
    families: Object.keys(painters),
    notes: 'dense pixel-art pass: every gradient is carried by an ordered Bayer dither plus a per-texel hash grain (matching the reference mottling style, median run length 1 texel), and every tile carries real features (bubbles, pits, wet specks, facet lines, glow cracks); emissive families duplicated on the glow atlas; swatch board + palette grid fill the free space',
  };
};
