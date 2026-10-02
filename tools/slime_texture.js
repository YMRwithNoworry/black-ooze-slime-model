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

  // ---- coherent value noise: how the references get their mottling ----------------------
  // The reference creatures in refs/ are mottled over the WHOLE surface (no large flat areas),
  // but the mottling arrives as CLUMPS whose silhouette wanders over 2-4 texels.  At one texel
  // per model unit a per-texel hash or a Bayer dither is not mottling - it is static, and it is
  // what made the gel look like scattered confetti.  Smooth low-frequency value noise, pushed
  // through the palette ramp (which quantises it into hard tone steps), gives the same dense
  // coverage with patches a human eye reads as painted stone/gel instead of noise.
  function vnoise(x, y, s) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi, s), b = hash(xi + 1, yi, s);
    const c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }
  function fbm2(x, y, s) {
    return vnoise(x, y, s) * 0.62 + vnoise(x * 2.07 + 13.4, y * 2.03 + 7.1, s + 977) * 0.38;
  }

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
      /** Vertical ramp, POSTERISED: kTop -> kBot in hard steps, one flat colour per row band.
          Deliberately not dithered.  The atlas runs at one texel per model unit, so a per-texel
          Bayer/hash dither ('grain' is accepted and ignored) is exactly the speckle that reads as
          noise on screen - flat bands plus a few deliberate specks read as painted material. */
      ramp(y0, y1, kTop, kBot, put, grain = 0, bands = 0) {
        const rows = Math.max(1, y1 - y0 + 1);
        // 2 flat bands on a 3-4 row tile, 3 on anything taller: a 1-row-per-tone ramp reads as
        // stripes, and two tones with a clean edge read as painted form.
        const nb = bands || clamp(Math.round(rows / 2), 1, 3);
        for (let yy = y0; yy <= y1; yy++) {
          const t = rows > 1 ? (yy - y0) / (rows - 1) : 0;
          const b = nb > 1 ? Math.min(nb - 1, Math.floor(t * nb)) : 0;
          const k = nb > 1 ? kTop + (kBot - kTop) * (b / (nb - 1)) : (kTop + kBot) / 2;
          for (let xx = 0; xx < w; xx++) put(xx, yy, k);
        }
      },
      /** Jelly.  Stone and jelly need OPPOSITE treatments: the reference obsidian is gravelly
          (clumps of near-black beside mid-grey), but a gel body is a smooth, wet, translucent
          mass.  What sells jelly at one texel per model unit is not texture at all - it is
          1) a calm, broad value ramp with almost no grain, 2) a hard, bright specular where the
          surface turns up towards the light, and 3) a dark, saturated rim where the body
          thickens and the light stops passing through.  Grain is added only as a whisper, so the
          surface reads as smooth-but-organic rather than flat. */
      gloss(k, o = {}) {
        const bands = o.bands || (h <= 2 ? 1 : h <= 4 ? 2 : 3);
        const lit = (o.lit === undefined ? 1.1 : o.lit);      // how much brighter the top edge is
        const rim = (o.rim === undefined ? 1.5 : o.rim);      // how much darker the bottom edge is
        const body = (o.body === undefined ? 1.0 : o.body);   // depth of the broad interior blob
        // A rim on EVERY layer is what turned the dome into horizontal strata: eight stacked
        // cubes each darkening along their own bottom edge is a rock face, not one smooth body.
        // Stacked gel wants the opposite - the layers must read as a single continuous surface,
        // so the per-layer rim is optional and off by default on the dome sides.
        const rimRows = (o.rimRows === undefined ? 1 : o.rimRows);
        // TRANSLUCENCY.  This is the cue that separates jelly from stone more than any other:
        // where the body is thin (its top and bottom edges) light passes through and the gel
        // glows; where it is thick (the middle) the light is absorbed and the gel darkens.
        // Opaque rock does the exact opposite - dark at the bottom contact, flat through the
        // middle - which is what this model looked like before.
        const transmit = (o.transmit === undefined ? 0 : o.transmit);
        for (let y = 0; y < h; y++) {
          const t = h > 1 ? y / (h - 1) : 0;
          const b = bands > 1 ? Math.min(bands - 1, Math.floor(t * bands)) : 0;
          let kk = bands > 1 ? k + lit - (lit + rim) * (b / (bands - 1)) : k;
          if (transmit && h >= 3) {
            const edge = Math.min(t, 1 - t);              // 0 at the edges, 0.5 in the middle
            kk += transmit * (0.5 - edge) * 2;            // thin edges brighter, thick middle darker
          }
          for (let x = 0; x < w; x++) P.px(x, y, gel(kk));
        }
        // one broad, soft interior swell: a jelly body is not a flat plate
        if (w >= 3 && h >= 2) P.blotch(k + body, { x: (w - 1) / 2, y: Math.max(0, h * 0.35), r: Math.max(2, Math.min(w, h * 2) / 2), squash: h / Math.max(1, w), soft: 0.7, scale: 0.42 });
        // A wet glint, shaped like a rounded catch-light rather than a pasted white square:
        // one hot texel, its two neighbours one step down, and the diagonal two steps down.
        // This is the single strongest "this is wet, smooth jelly" cue at this resolution.
        const n = clamp(Math.round((w * h) / 40), 1, 2);
        for (let i = 0; i < n; i++) {
          const sx = 1 + Math.floor(hash(i, 41, P.seed) * Math.max(1, w - 3));
          const sy = Math.floor(hash(i, 42, P.seed) * Math.max(1, Math.ceil(h * 0.4)));
          P.px(sx, sy, gel(GEL.length - 1));
          P.px(sx + 1, sy, gel(GEL.length - 2));
          if (h >= 3) P.px(sx, sy + 1, gel(GEL.length - 2));
          if (w >= 6) P.px(sx + 1, sy + 1, gel(k + lit * 1.5));
        }
        if (rimRows >= 1 && h >= 2) P.row(h - 1, 0, w - 1, gel(k - rim));
        if (rimRows >= 2 && h >= 4) P.row(h - 2, 0, w - 1, gel(k - rim * 0.4));
        if (w >= 6 && h >= 3) { P.col(0, 1, h - 2, gel(k - 0.6)); P.col(w - 1, 1, h - 2, gel(k - 0.6)); }
      },
      /** Coherent mottling over the WHOLE tile - the general gel surface.
          This is the single most important style change: the reference models are mottled
          everywhere, but the mottling arrives as clumps with wandering outlines, not as one flat
          tone with a couple of random rectangles dropped on it (which read as accidental damage,
          not as material).  scale < 1 makes the clumps wider than a texel, amp is the tone
          spread, drop tilts the tone darker towards the tile's bottom edge (gel pools dark) and
          jitter keeps a whisper of per-texel break-up without turning it into static. */
      mottle(k, o = {}) {
        const map = o.map || gel;
        const sc = (o.scale === undefined ? 0.62 : o.scale);
        const amp = (o.amp === undefined ? 1.5 : o.amp);
        const drop = (o.drop === undefined ? 0.9 : o.drop);
        const jit = (o.jitter === undefined ? 0.22 : o.jitter);
        // A 2-octave average clusters hard around 0.5, so the raw field almost never reaches the
        // ends of its range and each tile lands on 2 ramp steps however wide the palette ramp is.
        // Stretching around the midpoint is what turns the field into clumps that actually span
        // the tone range - the difference between "tinted flat" and "material".
        const st = (o.stretch === undefined ? 1.28 : o.stretch);
        const seed = P.seed + (o.seed || 0);
        for (let y = 0; y < h; y++) {
          const vk = h > 1 ? drop * (y / (h - 1)) : 0;
          for (let x = 0; x < w; x++) {
            const n = clamp((fbm2(x * sc + 0.5, y * sc + 0.5, seed) - 0.5) * st + 0.5, 0, 1);
            P.px(x, y, map(k + (n - 0.5) * amp - vk + (hash(x, y, seed + 31) - 0.5) * jit));
          }
        }
      },
      /** Shapes drawn from the noise field itself, so "features" have the same wandering
          outlines as the mottling instead of being axis-aligned boxes. */
      blotch(k, o = {}) {
        const map = o.map || gel;
        const cx = (o.x === undefined ? (w - 1) / 2 : o.x), cy = (o.y === undefined ? (h - 1) / 2 : o.y);
        const r = (o.r === undefined ? 2 : o.r), sc = (o.scale === undefined ? 0.7 : o.scale);
        const soft = (o.soft === undefined ? 0.35 : o.soft), seed = P.seed + (o.seed || 0);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const d = Math.hypot((x - cx) / Math.max(0.6, r), (y - cy) / Math.max(0.6, r * (o.squash || 1)));
          const n = fbm2(x * sc + 9.3, y * sc + 4.7, seed);
          if (d + (n - 0.5) * soft * 2.2 <= 1) P.px(x, y, map(k));
        }
      },
      /** A few *deliberate* gel specks: one texel of light with one texel of shadow under it, so
          the eye reads a glint rather than grain.  Capped at 3 per tile on purpose. */
      grit(n, kBase, spread = 4) {
        // one or two CONTIGUOUS mottling patches, 2-4 texels across.  Isolated single texels at
        // one texel per model unit read as dirt on screen; a patch reads as painted material.
        const patches = Math.min(2, Math.max(1, Math.round(n / 3)));
        for (let i = 0; i < patches; i++) {
          const cw = Math.min(w, 2 + Math.floor(hash(i, 5, P.seed + 3) * 2.6));
          const ch = Math.min(h, 1 + Math.floor(hash(i, 6, P.seed + 5) * 2.4));
          const cx = Math.floor(hash(i, 1, P.seed + 7) * Math.max(1, w - cw));
          const cy = Math.floor(hash(i, 2, P.seed + 11) * Math.max(1, h - ch));
          const k = kBase + (hash(i, 3, P.seed + 13) > 0.5 ? 1 : -1);
          for (let y = cy; y < cy + ch; y++) for (let x = cx; x < cx + cw; x++) P.px(x, y, gel(k));
        }
      },
      // 3x3 gel bubble: bright upper-left arc, softened lower-right, glassy middle
      bubble3(x, y, k) {
        P.px(x + 1, y, gel(k + 1.6)); P.px(x, y + 1, gel(k + 1.2));
        P.px(x + 1, y + 1, gel(k - 0.4));
        P.px(x + 2, y + 1, gel(k + 0.5)); P.px(x + 1, y + 2, gel(k + 0.5));
      },
      streak(x, y0, y1, k) { P.col(x, y0, y1, gel(k + 2)); P.px(x, y0, gel(k + 4)); },
      /** A 1-texel bevel: lit top row, shaded bottom row and flanks.  This is what makes a block
          read as a solid volume instead of a flat patch - deliberate structure, not noise. */
      /** A 1-texel bevel: lit top row, shaded bottom row and flanks.  This is what makes a block
          read as a solid volume instead of a flat patch - deliberate structure, not noise.
          It is BUDGET-AWARE: a 3-texel-tall face cannot afford two of its three rows spent on
          edges, which is what turned the thin dome layers into flat light/dark bands.  Below
          5 rows the bevel retreats to a single pixel of lift and no drop, and below 3 rows it
          does not run at all - the mottling is the material, the bevel is only an accent. */
      bevel(k, lift = 1, drop = 1, flanks = true) {
        if (h < 3) return;
        if (h < 5) {
          P.px(0, 0, gel(k + lift));
          P.px(w - 1, 0, gel(k + lift));
          if (w >= 3) P.row(0, 1, w - 2, gel(k + lift * 0.5));
          return;
        }
        P.row(0, 0, w - 1, gel(k + lift));
        P.row(h - 1, 0, w - 1, gel(k - drop));
        if (flanks && h >= 3) { P.col(0, 1, h - 2, gel(k - drop * 0.7)); P.col(w - 1, 1, h - 2, gel(k - drop * 0.7)); }
      },
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
    // Jelly is LIGHT.  Mapping layer light straight onto the whole 13-step ramp put the bottom
    // layers near gelShadow/gelRim (#123830 - almost black obsidian), which is right for a stone
    // body and wrong for gel: it made the mass read as rock no matter how it was painted.  The
    // body now lives in the upper 3/4 of the ramp and the shading is carried by the glints and
    // the thickened rim instead of by drowning the whole body in shadow.
    const kc = 3.2 + light * (GEL.length - 1 - 3.8);
    const R = (y0, y1, a, b) => P.ramp(y0, y1, a, b, (x, y, k) => P.px(x, y, gel(k)));

    // Every gel surface is mottled over its WHOLE area in coherent clumps, then shaped by
    // gravity-driven features: a lit waterline, vertical run-off streaks, pooled dark at the
    // bottom edge.  The material reads as one surface rather than a tinted box.
    if (part === 'skirt') {
      // wet ground puddle: dark pooled gel, a bright waterline, run-off streaks below it
      const k = Math.round(kc);
      P.mottle(k, { scale: 0.75, amp: 1.8, drop: 1.4, jitter: 0.1 });
      P.row(0, 0, w - 1, gel(k + 2));                       // waterline
      for (let i = 0; i < Math.max(2, Math.round(w / 5)); i++) {
        const x = Math.floor(hash(i, 1, P.seed) * w);
        P.col(x, 1, Math.max(1, h - 2), gel(k - 1));        // run-off columns
        P.px(x, 1, gel(k + 1));
      }
      P.row(h - 1, 0, w - 1, gel(k - 2));                   // contact shadow
      if (h >= 3) { P.col(0, 1, h - 2, gel(k - 1)); P.col(w - 1, 1, h - 2, gel(k - 1)); }
      return;
    }
    if (part === 'drip') {
      // a hanging drip: dark at the tip, one wet highlight running down its leading edge
      const k = Math.round(kc);
      P.mottle(k, { scale: 0.8, amp: 0.9, drop: 1.2, jitter: 0.08 });
      P.col(0, 0, h - 1, gel(k - 1)); P.col(w - 1, 0, h - 1, gel(k - 1));
      P.col(Math.min(w - 1, 1), 0, h - 1, gel(k + 2)); P.px(Math.min(w - 1, 1), 0, gel(k + 3));
      return;
    }
    if (part === 'lobe') {
      const k = Math.round(kc);
      P.mottle(k, { scale: 0.58, amp: 1.9, drop: 0.9, jitter: 0.1 });
      P.bevel(k, 1.5, 1.5);
      if (w >= 7 && h >= 4) P.blotch(k + 0.9, { x: 1 + r() * (w - 4), y: h - 3, r: 2.2, squash: 0.85 });
      return;
    }
    if (part === 'knob') {
      const k = Math.round(kc);
      P.mottle(k, { scale: 0.66, amp: 1.2, drop: 0.6, jitter: 0.08 });
      P.px(1, 1, gel(k + 3)); P.px(2, 0, gel(k + 3)); P.px(2, 1, gel(k + 2));
      P.row(h - 1, 0, w - 1, gel(k - 1));
      return;
    }
    if (part === 'antenna') {
      const k = Math.round(kc);
      P.mottle(k, { scale: 0.8, amp: 1.0, drop: 0.5, jitter: 0.08 });
      P.bevel(k, 1, 1, false);
      P.col(Math.min(w - 1, 1), 0, h - 1, gel(k + 2));
      P.px(1, 0, gel(k + 3));
      return;
    }
    // dome / lid / streak: JELLY, not stone.  The six dome layers already carry the vertical
    // gradient (light 0.10 -> 0.92), so the tile only has to sell the material: a smooth wet
    // body, a hard specular, and a dark thickened rim.  One run-off streak or bubble at most,
    // placed deliberately - the previous gravelly mottling is what made this read as rock.
    const k = Math.round(kc);
    P.gloss(k, { lit: 0.6, rim: 0.4, body: 0.4, rimRows: 0, transmit: 1.6 });
    if (h >= 5 && w >= 6 && light < 0.6) {          // a drip of gel hanging off the layer above
      const x = 2 + Math.floor(hash(0, 22, P.seed) * Math.max(1, w - 4));
      const y1 = Math.max(2, Math.floor(h * 0.5));
      P.col(x, 0, y1, gel(k + 0.8));
      P.px(x, y1, gel(k + 1.6));
    }
    if (h >= 6 && w >= 8 && light < 0.5) {          // one suspended bubble, low on the body
      const bx = 2 + hash(3, 6, P.seed) * (w - 5), by = h - 4;
      P.blotch(k + 1.4, { x: bx, y: by, r: 2.2, squash: 0.8, soft: 0.5 });
      P.px(Math.round(bx), Math.round(by), gel(k + 2.2));   // its little catch-light
    }
  };

  painters.gel_up = function (p) {
    const { P, t } = p, w = P.w, h = P.h;
    const part = (t.params && t.params.part) || 'dome';
    let light = lightOf(t, 0.85);
    if (part === 'skirt') light = Math.max(0, light - 0.45);
    const kc = 3.2 + light * (GEL.length - 1 - 3.8) + 0.8;
    if (h === 1) {   // single-row ridge (lip/knob tops): a sheen with clumped break-up
      const k = Math.round(kc);
      for (let x = 0; x < w; x++) {
        const n = fbm2(x * 0.85 + 0.5, 0.5, P.seed);
        P.px(x, 0, gel(k + (n - 0.5) * 1.6 + 0.3 - Math.abs(x - (w - 1) / 2) / Math.max(1, w)));
      }
      P.px(0, 0, gel(k - 3)); P.px(w - 1, 0, gel(k - 3));
      return;
    }
    if (part === 'skirt') {
      // dark wet pool: clumped tone, a soft reflection patch, shaded rim
      const k = Math.round(kc - 3.6);
      P.mottle(k, { scale: 0.85, amp: 1.0, drop: 0.5, jitter: 0.08 });
      const cx = (w - 1) / 2;
      for (let y = 1; y < Math.max(2, h - 1); y++) {
        const half = Math.max(1, Math.floor((h - y) / 2.2));
        for (let x = Math.max(1, Math.round(cx - half)); x <= Math.min(w - 2, Math.round(cx + half)); x++) P.px(x, y, gel(k + 1));
      }
      P.col(0, 0, h - 1, gel(k - 1)); P.col(w - 1, 0, h - 1, gel(k - 1));
      P.row(h - 1, 0, w - 1, gel(k - 1));
      return;
    }
    // The rings that show between the dome layers are not shelves of rock - they are the layer
    // edge seen THROUGH the gel above, so they stay close to the body tone with only a soft
    // inner light.  Only the top cap is a real free surface and gets the big wet pool + hard
    // highlight.  Painting every ring as a bright glossy plate is what produced the stone
    // strata look.
    const k = Math.round(kc);
    const topCap = light > 0.9 || (w <= 6 && h <= 6 && light > 0.84);
    P.gloss(k, { lit: topCap ? 1.2 : 0.5, rim: 1.0, body: 0.5, rimRows: 0 });
    if (topCap) {
      const bx = 1 + hash(0, 4, P.seed) * Math.max(1, w - 4);
      const by = 1 + hash(0, 5, P.seed) * Math.max(1, h - 4);
      P.blotch(k + 1.2, { x: bx, y: by, r: Math.max(2.2, Math.min(w, h) * 0.35), squash: h / Math.max(1, w), soft: 0.6, scale: 0.38 });
      P.px(Math.round(bx), Math.round(by), gel(GEL.length - 1));
      if (w >= 6) P.px(Math.round(bx) + 1, Math.round(by), gel(GEL.length - 2));
    } else {
      // submerged edge: a soft sheen along the near edge only, no pasted white square
      for (let x = 0; x < w; x++) {
        const n = fbm2(x * 0.7 + 0.5, 0.5, P.seed + 5);
        if (n > 0.58) P.px(x, 0, gel(k + 0.9));
      }
      if (h >= 3) P.row(1, 0, w - 1, gel(k + 0.3));
    }
  };

  painters.gel_down = function (p) {
    const { P } = p, w = P.w, h = P.h;
    // underside: the darkest body tone, only the middle catching a little bounce light
    P.mottle(1, { scale: 0.7, amp: 0.9, drop: 0, jitter: 0.08 });
    P.blotch(2.2, { r: Math.max(1.6, Math.min(w, h) / 2 - 0.8), squash: h / Math.max(1, w) });
    P.blotch(3.0, { r: Math.max(0.9, Math.min(w, h) / 4), squash: h / Math.max(1, w), seed: 91 });
    P.outline(gel(0));
  };

  painters.gel_lid = function (p) {
    const { P } = p, w = P.w, h = P.h;
    P.mottle(7, { scale: 0.75, amp: 1.1, drop: 0.5, jitter: 0.08 });
    P.row(0, 0, w - 1, gel(9));
    P.px(1, 0, gel(11)); P.px(2, 0, gel(10));
    P.col(0, 0, h - 1, gel(5)); P.col(w - 1, 0, h - 1, gel(5));
    if (h > 1) P.row(h - 1, 0, w - 1, gel(4));
  };

  painters.gel_streak = function (p) {
    const { P } = p;
    P.ramp(0, P.h - 1, 10.4, 3.6, (x, y, k) => P.px(x, y, gel(k)), 0.8);
    P.col(1, 0, P.h - 1, gel(11.4));
    P.col(P.w - 1, 0, P.h - 1, gel(5.0));
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
        const n = fbm2(x * 0.8 + 3.1, y * 0.8 + 6.4, Q.seed);
        Q.px(x, y, acid(3.6 + boost - d * 2.6 + (n - 0.5) * 1.1));
      }
      Q.px(1, 1, acid(4)); Q.px(2, 1, SH('acidPale', 6));
      Q.col(0, 0, Q.h - 1, acid(0.6)); Q.row(Q.h - 1, 0, Q.w - 1, acid(0.6));
    }
  };
  painters.acid_up = function (p) {
    for (const Q of [p.P, p.G]) {
      for (let y = 0; y < Q.h; y++) for (let x = 0; x < Q.w; x++) {
        const n = fbm2(x * 0.85 + 1.7, y * 0.85 + 2.9, Q.seed);
        Q.px(x, y, acid(3.0 - y * 0.7 + (n - 0.5) * 1.0));
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
    // obsidian: clumped facet mottling (the reference shards are never a flat wash either),
    // then a lit left edge, a shadowed right flank and a bright tip
    P.mottle(0.5 + light + h * 0.055, { map: xtal, scale: 0.9, amp: 1.5, drop: 0.5, jitter: 0.07 });
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
    for (let i = 0; i < 5; i++) {
      box(c5.x + i * 5, c5.y + 8, 4, 8, ACID[i]);
      box(c5.x + i * 5, c5.y, 4, 6, GEL[clamp(Math.round(i * 2.6), 0, GEL.length - 1)]);
    }
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
