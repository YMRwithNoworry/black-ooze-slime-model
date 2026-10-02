'use strict';
// =====================================================================================
// ACID GEL SLIME — texture painter.  OWNER: lead (recovered from the texture-artist's task).
//
// Contract: module.exports = function build(ctx) -> { base, glow, families, notes }
//   base : 128x128 RGBA, every texel opaque, every tile painted with structure.
//   glow : 128x128 RGBA, alpha 0 outside the emissive families, fully painted inside them.
//
// Colour discipline: every pixel is a PALETTE colour or shade(PALETTE[name], k/32).  The body
// is built from one 13-step mint->deep-teal ramp; gel tiles carry params.light (0 = bottom of
// the body, 1 = top) so the 7 dome layers continue a single vertical gradient.
//
// The 128x128 atlas is only ~12 % full, so the free space carries a swatch board (tone ramp,
// an assembled dome/mouth reference, texture cards and the full palette grid) so a human can
// repaint the model later without guessing.
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

  // ---- tone ramps (all palette / shade colours, monotonically lighter) ----------------
  const GEL = [
    rgb('gelRim'), rgb('gelShadow'), rgb('gelDeep'), SH('gelDark', -10), rgb('gelDark'),
    SH('gelMidDark', -8), rgb('gelMidDark'), SH('gelMid', -6), rgb('gelMid'), SH('gelMid', 12),
    rgb('gelLight'), rgb('gelWet'), rgb('gelHi'),
  ];
  const ACID = [rgb('acidDark'), rgb('acidDeep'), rgb('acid'), rgb('acidBright'), rgb('acidPale'), SH('acidVein', 0)];
  const XTAL = [rgb('xtalDark'), rgb('xtalMid'), rgb('xtalLight'), rgb('xtalEdge'), rgb('xtalGlow'), rgb('xtalGlowHi')];
  const EYE = [rgb('eyePit'), rgb('eyeDark'), rgb('eyeMid'), rgb('eyeGlass'), rgb('irisTeal'), rgb('irisLime'), rgb('eyeSpark2'), rgb('eyeSpark')];
  const MAW = [rgb('mawDeep'), rgb('mawInner'), SH('mawInner', 8), rgb('mawTongue'), rgb('mawTongueHi')];
  const TOOTH = [rgb('toothEdge'), rgb('toothShade'), rgb('tooth')];
  const gel = (k) => GEL[clamp(Math.round(k), 0, GEL.length - 1)];
  const acid = (k) => ACID[clamp(Math.round(k), 0, ACID.length - 1)];
  const xtal = (k) => XTAL[clamp(Math.round(k), 0, XTAL.length - 1)];
  const eye = (k) => EYE[clamp(Math.round(k), 0, EYE.length - 1)];
  const mawc = (k) => MAW[clamp(Math.round(k), 0, MAW.length - 1)];
  const tooth = (k) => TOOTH[clamp(Math.round(k), 0, TOOTH.length - 1)];
  const lightOf = (t, d) => (t.params && typeof t.params.light === 'number' ? t.params.light : d);

  // ---- pen: bounds-checked drawing inside a tile ---------------------------------------
  function pen(view, w, h) {
    const P = {
      w, h, view,
      px(x, y, c) { if (x < 0 || y < 0 || x >= w || y >= h) return; view.set(x, y, c); },
      row(y, x0, x1, c) { for (let x = x0; x <= x1; x++) P.px(x, y, c); },
      col(x, y0, y1, c) { for (let y = y0; y <= y1; y++) P.px(x, y, c); },
      box(x, y, ww, hh, c) { for (let yy = y; yy < y + hh; yy++) for (let xx = x; xx < x + ww; xx++) P.px(xx, yy, c); },
      outline(c) { P.row(0, 0, w - 1, c); P.row(h - 1, 0, w - 1, c); P.col(0, 0, h - 1, c); P.col(w - 1, 0, h - 1, c); },
      circle(cx, cy, r, c) { for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) P.px(x, y, c); },
      poly(pts, c) { view.fillPoly(pts, c); },
      // 3x3 gel bubble: bright upper-left arc, soft lower-right, glassy middle
      bubble3(x, y, k) {
        P.px(x + 1, y, gel(k + 3)); P.px(x, y + 1, gel(k + 3)); P.px(x + 1, y + 1, gel(k - 1));
        P.px(x + 2, y + 1, gel(k + 1)); P.px(x + 1, y + 2, gel(k + 1));
      },
      bubble5(x, y, k) {
        P.row(y + 2, x + 1, x + 3, gel(k + 4)); P.row(y + 1, x + 1, x + 3, gel(k + 2));
        P.px(x, y + 2, gel(k + 3)); P.px(x + 4, y + 2, gel(k + 1));
        P.px(x + 1, y + 3, gel(k + 1)); P.px(x + 2, y + 3, gel(k + 1)); P.px(x + 3, y + 3, gel(k + 1));
        P.px(x + 2, y + 2, gel(k - 1)); P.px(x + 3, y + 2, gel(k - 1)); P.px(x + 2, y + 1, gel(k + 1));
      },
      streak(x, y0, y1, k) { P.col(x, y0, y1, gel(k + 2)); P.col(x + 1, y0, y1, gel(k + 3)); },
    };
    return P;
  }

  const base = new Canvas(res, res, rgb('gelMid'));
  const glow = new Canvas(res, res, [0, 0, 0, 0]);

  // =====================================================================================
  // family painters   p = { P: pen(base), G: pen(glow), t, r, w, h }
  // =====================================================================================
  const painters = {
    // ------------------------------------------------------------------ helpers
    void(p) { p.P.px(0, 0, rgb('void')); },
    seam(p) {
      const { P } = p;
      P.box(0, 0, P.w, P.h, gel(1));
      P.px(0, 0, gel(0)); P.px(2, 0, gel(0)); P.px(1, 1, SH('gelRim', -10));
      P.px(0, 2, gel(0)); P.px(2, 2, gel(0));
    },

    // ------------------------------------------------------------------ body gel
    gel_side(p) {
      const { P, t } = p, h = P.h, w = P.w;
      const light = lightOf(t, 0.3);
      const part = (t.params && t.params.part) || 'dome';
      const spacing = 0.14;
      const rows = [];
      for (let y = 0; y < h; y++) {
        let k = light * (GEL.length - 1) + (0.5 - (y + 0.5) / h) * spacing * (GEL.length - 1);
        if (part === 'skirt' || part === 'drip') k -= 0.7;
        if (part === 'lobe') k += 0.4;
        rows.push(k);
      }
      for (let y = 0; y < h; y++) {
        let base = rows[y] + (y === 0 ? 0.6 : 0) + (y === h - 1 ? -0.6 : 0);
        for (let x = 0; x < w; x++) {
          const t = w <= 1 ? 0 : x / (w - 1);
          P.px(x, y, gel(base + (0.55 - t * 1.1) * (h > 1 ? 1 : 0.6)));
        }
      }
      // wet streaks up high, bubbles down low, always asymmetric
      const r = p.r;
      if (light > 0.5 && w > 4) {
        for (let i = 0; i < 2; i++) {
          const x = 1 + Math.floor(r() * (w - 2));
          P.col(x, 0, 0, gel(rows[0] + 2.4));
          P.px(x + 1, 0, gel(rows[0] + 1.6));
        }
      }
      if (w >= 7 && h >= 3) {
        const n = light < 0.45 ? 2 : 1;
        for (let i = 0; i < n; i++) {
          const bx = 1 + Math.floor(r() * (w - 4));
          const by = h - 3;
          P.bubble3(bx, by, rows[Math.min(h - 2, by)]);
        }
      }
      if (w >= 5 && h >= 2) P.px(2 + Math.floor(r() * (w - 5)), Math.max(1, h - 2), gel(rows[h - 2] - 1.2));
      if (part === 'skirt') {                    // wet waterline + ground contact shadow
        P.row(0, 0, w - 1, gel(rows[0] + 1.6));
        P.row(h - 1, 0, w - 1, gel(0));
      }
      if (part === 'drip') {                     // a drip tapers toward its tip
        if (h >= 4) { P.px(0, h - 1, gel(1)); P.px(w - 1, h - 1, gel(1)); }
        P.px(1, Math.floor(h / 2), gel(rows[1] + 2));
      }
      if (part === 'lobe') {                     // round shoulder: light the top corners
        P.px(0, 0, gel(rows[0] + 0.8)); P.px(w - 1, 0, gel(rows[0] + 0.8));
        if (w > 3 && h > 3) { P.px(0, h - 1, gel(rows[h - 1] - 1)); P.px(w - 1, h - 1, gel(rows[h - 1] - 1)); }
      }
      if (part === 'knob') {
        P.box(1, 0, Math.max(1, w - 2), Math.max(1, Math.floor(h / 2)), gel(rows[0] + 1.4));
        P.px(1, 1, gel(GEL.length - 2)); P.px(2, 0, GEL[GEL.length - 1]);
        P.row(h - 1, 0, w - 1, gel(rows[h - 1] - 1.4));
      }
      if (part === 'antenna') {
        P.col(1, 0, h - 1, gel(rows[0] + 1.6));
        P.px(w - 1, 0, gel(rows[0] + 0.4));
      }
    },
    gel_up(p) {
      const { P, t } = p, w = P.w, h = P.h;
      if (h === 1) {   // single-row ridge (lip/knob tops): per-pixel sheen, never flat
        const bits = [9, 11, 10, 12, 10, 11, 9, 12];
        for (let x = 0; x < w; x++) P.px(x, 0, gel(bits[x % bits.length] - 2 + lightOf(t, 0.6) * 4));
        P.px(0, 0, gel(2)); P.px(w - 1, 0, gel(2));
        return;
      }
      const part = (t.params && t.params.part) || 'dome';
      let light = lightOf(t, 0.85);
      if (part === 'skirt') light = Math.max(0, light - 0.45);
      const k = light * (GEL.length - 1) + 0.8;
      P.box(0, 0, w, h, gel(k));
      if (part === 'skirt') {                    // dark wet pool with the body's reflection
        P.box(0, 0, w, h, gel(1.2));
        const cx = Math.floor(w / 2);
        for (let y = 0; y < h; y++) {
          const half = Math.max(1, Math.floor((h - y) / 2.2));
          P.row(y, clamp(cx - half, 0, w - 1), clamp(cx + half, 0, w - 1), gel(2.6 + (h - y) * 0.12));
        }
        P.outline(gel(0));
        P.row(0, 1, w - 2, gel(3.4));
        for (let i = 0; i < 3; i++) P.bubble3(1 + Math.floor(p.r() * Math.max(1, w - 4)), 1 + Math.floor(p.r() * Math.max(1, h - 4)), 1.6);
        return;
      }
      // glossy top: specular blobs + a darker edge where the surface curves away
      P.row(0, 1, w - 2, gel(k + 1.4));
      P.row(h - 1, 0, w - 1, gel(k - 1.6));
      P.col(0, 0, h - 1, gel(k - 0.8));
      P.col(w - 1, 0, h - 1, gel(k - 0.8));
      const r = p.r;
      const blobs = w >= 8 && h >= 6 ? 2 : 1;
      for (let i = 0; i < blobs; i++) {
        const bx = 1 + Math.floor(r() * Math.max(1, w - 4)), by = 1 + Math.floor(r() * Math.max(1, h - 3));
        P.box(bx, by, Math.min(2, w - bx - 1), Math.min(2, h - by - 1), gel(k + 2.4));
        P.px(bx, by, GEL[GEL.length - 1]);
      }
      if (w >= 7 && h >= 4) P.bubble3(1 + Math.floor(r() * (w - 4)), h - 3, k - 1.4);
    },
    gel_down(p) {
      const { P } = p, w = P.w, h = P.h;
      P.box(0, 0, w, h, gel(1.1));
      P.outline(gel(0));
      // bounce light mass in the middle, darkest at the corners
      const cx = (w - 1) / 2, cy = (h - 1) / 2;
      P.circle(cx, cy, Math.max(1.2, Math.min(w, h) / 2 - 0.6), gel(2.3));
      P.circle(cx, cy, Math.max(0.8, Math.min(w, h) / 4), gel(3.1));
      for (let i = 0; i < 4; i++) {
        const bx = 1 + Math.floor(p.r() * Math.max(1, w - 4)), by = 1 + Math.floor(p.r() * Math.max(1, h - 4));
        P.bubble3(bx, by, 2.4);
      }
      for (let i = 0; i < 2; i++) P.col(2 + i * 4, 0, Math.max(2, Math.floor(h / 3)), gel(1.6));
    },
    gel_lid(p) {
      const { P } = p, w = P.w;
      P.row(0, 0, w - 1, gel(9.4));
      P.row(1, 0, w - 1, gel(7.6));
      P.row(P.h - 1, 0, w - 1, gel(4.2));
      if (P.h > 2) P.row(2, 0, w - 1, gel(6));
      P.px(1, 0, GEL[GEL.length - 1]); P.px(2, 0, gel(11));
      P.col(0, 1, P.h - 1, gel(5.6)); P.col(w - 1, 1, P.h - 1, gel(5.6));
    },
    gel_streak(p) {
      const { P } = p;
      for (let y = 0; y < P.h; y++) P.row(y, 0, P.w - 1, gel(9 - y * 0.35));
      P.col(1, 0, P.h - 1, gel(11));
      P.col(P.w - 1, 0, P.h - 1, gel(5.4));
    },

    // ------------------------------------------------------------------ eyes
    eye(p) {   // dark glossy socket; the iris covers the middle so only a rim shows
      const { P } = p, w = P.w, h = P.h;
      P.row(0, 0, w - 1, eye(2));
      for (let y = 1; y < h - 1; y++) { P.row(y, 0, w - 1, eye(1)); P.row(y, 1, w - 2, eye(0)); }
      P.row(h - 1, 0, w - 1, eye(2));
      P.px(0, 0, eye(3)); P.px(w - 1, 0, eye(3));
      // faint inner glow (the iris light bouncing inside the socket)
      P.row(h - 1, 1, w - 2, SH('irisTeal', -18));
      P.px(0, h - 2, SH('irisTeal', -22)); P.px(w - 1, h - 2, SH('irisTeal', -22));
      P.px(1, h - 2, eye(2)); P.px(w - 2, h - 2, eye(2));
    },
    eye_glow(p) {  // 3x3 iris: teal glow disc, lime upper-left, one hard + one soft specular
      for (const Q of [p.P, p.G]) {
        Q.px(0, 0, eye(6)); Q.px(1, 0, eye(6)); Q.px(2, 0, eye(4));
        Q.px(0, 1, eye(5)); Q.px(1, 1, eye(7)); Q.px(2, 1, eye(4));
        Q.px(0, 2, eye(4)); Q.px(1, 2, eye(4)); Q.px(2, 2, eye(3));
      }
    },
    // 2x2; only texel (0,0) is sampled by the 1x1 spark faces, so it stays pure white
    eye_spark(p) {
      for (const Q of [p.P, p.G]) {
        Q.px(0, 0, eye(7)); Q.px(1, 0, eye(6));
        Q.px(0, 1, eye(6)); Q.px(1, 1, SH('eyeSpark2', -8));
      }
    },

    // ------------------------------------------------------------------ brow / mouth / maw
    brow(p) {
      const { P } = p, w = P.w;
      P.row(0, 0, w - 1, gel(3.4));
      P.row(0, 1, w - 2, gel(4.2));
      P.row(1, 0, w - 1, gel(0.6));
      P.px(2, 0, gel(5)); P.px(Math.max(0, w - 3), 0, gel(5));
      P.col(0, 0, 1, gel(1.2)); P.col(w - 1, 0, 1, gel(1.2));
    },
    lip(p) {   // friendly closed grin with a wet upper lip and a chin shadow
      const { P } = p, w = P.w, h = P.h;
      const baseK = 4.6;
      P.row(0, 0, w - 1, gel(baseK + 0.6));
      P.row(1, 0, w - 1, gel(baseK));
      if (h > 2) P.row(2, 0, w - 1, gel(baseK - 1.2));
      P.row(0, 2, Math.max(2, w - 3), gel(baseK + 2.4));       // wet gleam above the smile
      const mid = Math.floor(w / 2);
      const line = rgb('lipLine'), dimple = rgb('lipDark');
      P.px(0, 1, dimple); P.px(w - 1, 1, dimple);
      P.row(h > 2 ? 2 : 1, 1, w - 2, line);
      P.px(1, 1, line); P.px(w - 2, 1, line);
      if (h > 2) { P.px(mid, 2, line); }
      P.col(0, 0, h - 1, dimple); P.col(w - 1, 0, h - 1, dimple);
    },
    tooth(p) {
      const { P, t } = p, big = !(t.params && t.params.size === 'small');
      const tip = big ? tooth(2) : SH('tooth', -6);
      P.px(0, 0, tip); P.px(1, 0, tooth(1));
      P.px(0, 1, tooth(1)); P.px(1, 1, tooth(0));
    },
    maw(p) {   // dark throat: lit at the top, wet glints, deep at the bottom
      const { P } = p, w = P.w, h = P.h;
      for (let y = 0; y < h; y++) P.row(y, 0, w - 1, mawc(2 - y * 0.8));
      P.row(0, 0, w - 1, mawc(3));
      P.row(h - 1, 0, w - 1, mawc(0));
      P.px(2, 1, rgb('mawTongueHi')); P.px(Math.max(1, w - 3), Math.max(1, h - 2), SH('mawTongueHi', -8));
      P.col(0, 0, h - 1, mawc(0)); P.col(w - 1, 0, h - 1, mawc(0));
    },
    maw_floor(p) {
      const { P } = p, w = P.w, h = P.h;
      P.row(0, 0, w - 1, mawc(4));
      P.row(1, 0, w - 1, mawc(3));
      if (h > 2) P.row(2, 0, w - 1, mawc(1));
      P.px(1, 0, SH('mawTongueHi', 6)); P.px(Math.floor(w / 2), 0, rgb('mawTongueHi'));
      P.col(0, 0, h - 1, mawc(0)); P.col(w - 1, 0, h - 1, mawc(0));
    },
    tongue(p) {
      const { P } = p, w = P.w, h = P.h;
      P.row(0, 0, w - 1, mawc(4));
      P.row(0, 1, w - 2, SH('mawTongueHi', 4));
      if (h > 1) P.row(1, 0, w - 1, mawc(3));
      if (h > 2) P.row(2, 0, w - 1, SH('mawTongue', -10));
      P.px(1, 0, rgb('mawTongueHi')); P.px(w - 2, Math.min(h - 1, 1), rgb('mawTongueHi'));
      P.col(0, 0, h - 1, SH('mawTongue', -12)); P.col(w - 1, 0, h - 1, SH('mawTongue', -12));
    },
    tongue_up(p) { painters.tongue(p); },

    // ------------------------------------------------------------------ acid core / glow
    core(p) {   // faceted acid gem
      const { P } = p, w = P.w, h = P.h;
      P.row(0, 0, w - 1, acid(1));
      P.row(0, 1, w - 2, acid(3));
      P.row(0, 2, w - 3, acid(4));
      if (h > 1) { P.row(1, 0, w - 1, acid(0)); P.row(1, 1, w - 2, acid(2)); }
      if (h > 1) P.px(1, 1, acid(3));
      P.col(0, 0, h - 1, acid(0)); P.col(w - 1, 0, h - 1, acid(0));
      P.px(1, 0, SH('acidPale', 8));
    },
    core_up(p) {
      const { P } = p, w = P.w, h = P.h;
      for (let x = 0; x < w; x++) {
        const warm = 1 - Math.abs(x - (w - 1) / 2) / Math.max(1, w / 2);
        for (let y = 0; y < h; y++) P.px(x, y, acid(2 + warm * 2 - y * 0.8));
      }
      P.px(Math.max(1, Math.floor(w / 2) - 1), 0, SH('acidPale', 10));
      P.col(0, 0, h - 1, acid(1)); P.col(w - 1, 0, h - 1, acid(1));
    },
    core_glow(p) {
      const { P, G } = p;
      for (const Q of [P, G]) {
        for (let x = 0; x < Q.w; x++) {
          const warm = 1 - Math.abs(x - (Q.w - 1) / 2) / Math.max(1, Q.w / 2);
          Q.px(x, 0, acid(3 + warm * 1.6));
          if (Q.h > 1) Q.px(x, Q.h - 1, acid(2.2 + warm));
        }
        Q.px(Math.max(1, Math.floor(Q.w / 2) - 1), 0, SH('acidPale', 12));
        Q.col(0, 0, Q.h - 1, acid(2)); Q.col(Q.w - 1, 0, Q.h - 1, acid(2));
      }
    },
    acid_glow(p) {   // bulb / bead: hot core, cool rim
      const { P, G } = p, round = true;
      for (const [Q, boost] of [[P, 0], [G, 1]]) {
        Q.box(0, 0, Q.w, Q.h, acid(1 + boost));
        Q.circle((Q.w - 1) / 2, (Q.h - 1) / 2, Math.max(1, Math.min(Q.w, Q.h) / 2 - 0.2), acid(2 + boost));
        Q.circle((Q.w - 1) / 2, (Q.h - 1) / 2, Math.max(0.6, Math.min(Q.w, Q.h) / 4), acid(3 + boost));
        Q.px(1, 1, acid(4)); Q.px(2, 1, SH('acidPale', 6));
      }
    },
    acid_up(p) {
      const { P, G } = p;
      for (const Q of [P, G]) {
        Q.box(0, 0, Q.w, Q.h, acid(2));
        Q.row(0, 1, Q.w - 2, acid(3));
        Q.px(Math.max(1, Math.floor(Q.w / 2) - 1), 1, acid(4));
        Q.outline(acid(0));
      }
    },
    acid_fleck(p) {
      const { P, G } = p;
      for (const Q of [P, G]) {
        Q.box(0, 0, Q.w, Q.h, acid(1));
        Q.px(0, 0, acid(4)); Q.px(1, 1, acid(3)); Q.px(2, 0, acid(2));
        Q.px(Q.w - 1, Q.h - 1, acid(3)); Q.px(Q.w - 2, Q.h - 1, acid(2));
      }
    },

    // ------------------------------------------------------------------ crystals
    crystal(p) {
      const { P, t } = p, w = P.w, h = P.h;
      const light = lightOf(t, 0.45);
      for (let y = 0; y < h; y++) P.row(y, 0, w - 1, xtal(0.4 + light));
      P.col(0, 0, h - 1, xtal(3));                       // lit facet edge
      P.col(1, 0, h - 1, xtal(2.2));
      if (w > 2) { P.col(2, 0, h - 1, xtal(1.4)); }
      P.row(0, 0, w - 1, xtal(3.4));                     // tip catches the light
      P.row(1, 1, Math.max(1, w - 2), xtal(2.6));
      // glow crack zig-zagging up the facet
      let x = Math.max(1, w - 2);
      for (let y = h - 1; y >= 0; y--) {
        P.px(x, y, xtal(4));
        if ((h - y) % 2 === 0) { x = clamp(x + 1, 1, w - 1); P.px(x, y, xtal(5)); } else x = clamp(x - 1, 0, w - 1);
      }
      P.px(0, 0, xtal(5));
      P.row(h - 1, 0, w - 1, xtal(0));
      P.col(w - 1, 0, h - 1, xtal(0.2));                 // shadow side
    },
    crystal_top(p) {
      const { P } = p, w = P.w, h = P.h;
      P.box(0, 0, w, h, xtal(2.4));
      P.poly([[0, 0], [w - 1, 0], [Math.floor(w / 2), h - 1]], xtal(3.2));
      P.px(1, 1, xtal(4));
      P.outline(xtal(1));
    },
    crystal_glow(p) {
      const { P, G } = p;
      for (const Q of [P, G]) {
        Q.box(0, 0, Q.w, Q.h, xtal(4));
        Q.px(0, 0, xtal(5)); Q.px(Q.w - 1, Q.h - 1, xtal(3));
        if (Q.w > 2) Q.px(1, 1, xtal(5));
      }
    },
  };

  // =====================================================================================
  // paint every tile
  // =====================================================================================
  for (const t of atlas.list) {
    const painter = painters[t.family];
    if (!painter) throw new Error('no painter for tile family "' + t.family + '" (tile ' + t.name + ')');
    const p = {
      t, w: t.w, h: t.h, r: prng('slime:' + t.name),
      P: pen(new C.TileView(base, t), t.w, t.h),
      G: pen(new C.TileView(glow, t), t.w, t.h),
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

    // --- gel tone ramp: 13 chips
    text(0, ly, 'GEL RAMP', rgb('gelWet'));
    ly += 7;
    for (let i = 0; i < GEL.length; i++) {
      const cx = i * 9;
      box(cx, ly, 8, 8, GEL[i]);
      box(cx, ly, 8, 1, GEL[clamp(i + 1, 0, GEL.length - 1)]);
      box(cx, ly + 7, 8, 1, GEL[clamp(i - 1, 0, GEL.length - 1)]);
    }
    ly += 10;
    // --- continuous ramp strip
    for (let x = 0; x < res; x++) box(x, ly, 1, 3, gel((x / (res - 1)) * (GEL.length - 1)));
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
    // face reference: brow / lid / eye assembly / lip / fangs, at model scale
    const put = (name, dx, dy2, w, h) => { const t = atlas.get(name); base.copyRect(t.x, t.y, Math.min(w, t.w), Math.min(h, t.h), dx, dy2); };
    put('brow_dark', 21, ly, 5, 2);
    put('eye_lid', 21, ly + 4, 4, 2);
    put('eye_sclera', 21, ly + 7, 4, 4);
    put('eye_iris', 21.0 | 0, ly + 8, 3, 3);
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

    // --- texture cards
    const c1 = card(0, ly, 22, 20, 'BUBBLE');
    for (let i = 0; i < 4; i++) {
      const bx = c1.x + (i % 2) * 7, by = c1.y + Math.floor(i / 2) * 6;
      box(bx, by, 6, 5, gel(4));
      box(bx + 1, by + 1, 4, 3, gel(2.6));
      box(bx + 2, by + 2, 2, 1, gel(6));
    }
    const c2 = card(24, ly, 22, 20, 'DRIP');
    box(c2.x, c2.y, 8, 16, gel(2.4));
    box(c2.x + 1, c2.y, 6, 6, gel(4.4));
    box(c2.x + 2, c2.y + 6, 4, 4, gel(3.4));
    box(c2.x + 3, c2.y + 10, 2, 4, gel(5.4));
    box(c2.x + 1, c2.y + 13, 6, 3, gel(6.4));
    const c3 = card(48, ly, 22, 20, 'SKIRT');
    box(c3.x, c3.y, 18, 16, gel(1.2));
    box(c3.x, c3.y, 18, 2, gel(3.2));
    for (let i = 0; i < 5; i++) box(c3.x + 1 + i * 3, c3.y + 3, 2, 11, gel(2.4));
    box(c3.x, c3.y + 14, 18, 2, gel(0));
    const c4 = card(72, ly, 22, 20, 'XTAL');
    box(c4.x, c4.y, 18, 16, xtal(1));
    for (let i = 0; i < 3; i++) box(c4.x + 1 + i * 6, c4.y + 2, 4, 12, xtal(2 + i * 0.4));
    for (let i = 0; i < 3; i++) box(c4.x + 2 + i * 6, c4.y + 3, 1, 9, xtal(4));
    const c5 = card(96, ly, 28, 20, 'ACID');
    for (let i = 0; i < 5; i++) box(c5.x + i * 5, c5.y + 8, 4, 8, ACID[i]);
    for (let i = 0; i < 5; i++) box(c5.x + i * 5, c5.y, 4, 6, gel(i * 2.6));
    ly += 22;

    // --- palette grid: every named colour in tools/lib/canvas.js
    text(0, ly, 'PALETTE', rgb('gelWet'));
    ly += 7;
    const names = Object.keys(C.PALETTE);
    names.forEach((n, i) => {
      const cx = (i % 21) * 6, cy = ly + Math.floor(i / 21) * 6;
      box(cx, cy, 5, 5, rgb(n));
      px(cx, cy, SH(n, 10));
      px(cx + 4, cy + 4, SH(n, -10));
    });
  }

  return {
    base: base.pixels,
    glow: glow.pixels,
    families: Object.keys(painters),
    notes: 'hand-painted: 13-step gel ramp continues across the dome layers; wet-look rims, bubbles, glow cracks; emissive layer duplicated on the glow atlas; swatch board + palette grid fill the free atlas space',
  };
};
