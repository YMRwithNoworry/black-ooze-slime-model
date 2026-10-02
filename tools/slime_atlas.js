'use strict';
// ACID GEL SLIME — UV atlas vocabulary. OWNER: lead. Producers must not edit this file;
// ask the lead if a tile is missing.
//
// A tile is a rectangle in the base atlas. `family` tells tools/slime_texture.js how to paint
// it and `params` tunes the painter. Geometry assigns tiles per cube face, so the geometry and
// the texture stay in sync by construction (a face is exactly as big as its tile).
const { Atlas } = require('./lib/atlas.js');

function build() {
  const A = new Atlas(128, 128, 1);

  // ---------- helpers for hidden / deliberately stretched faces ----------
  A.alloc('void_px', 1, 1, 'void');            // unused faces
  A.alloc('seam_dark', 3, 3, 'seam');          // thin exposed rims between stacked layers

  // ---------- dome: one long-face + one short-face tile per layer (continuous gradient) ----------
  // long  = +-z faces of the wide cube (A) and +-x faces of the deep cube (B)
  // short = the other pair.  light = 0 (bottom) .. 1 (top) drives the body gradient.
  const layers = [
    ['L1', 18, 4, 12, 4, 0.10],
    ['L2', 17, 3, 11, 3, 0.24],
    ['L3', 15, 3, 10, 3, 0.38],
    ['L4', 13, 2, 9, 2, 0.52],
    ['L5', 10, 2, 7, 2, 0.66],
    ['L6', 8, 2, 6, 2, 0.80],
    ['L7', 5, 1, 5, 1, 0.92],
  ];
  for (const L of layers) {
    A.alloc('gel_' + L[0] + '_long', L[1], L[2], 'gel_side', { light: L[5], layer: L[0], axis: 'long' });
    A.alloc('gel_' + L[0] + '_short', L[3], L[4], 'gel_side', { light: L[5], layer: L[0], axis: 'short' });
  }
  A.alloc('gel_top_ring_b', 6, 8, 'gel_up', { light: 0.88 });
  A.alloc('gel_top_cap', 5, 5, 'gel_up', { light: 0.96 });   // L7 top
  A.alloc('gel_top_ring', 8, 6, 'gel_up', { light: 0.86 });  // L6 exposed top ring
  A.alloc('gel_under', 18, 12, 'gel_down', { light: 0.02 });  // L1 underside

  // ---------- skirt (ground puddle) ----------
  A.alloc('gel_skirt_long', 13, 3, 'gel_side', { light: 0.04, part: 'skirt' });
  A.alloc('gel_skirt_short', 5, 3, 'gel_side', { light: 0.07, part: 'skirt' });
  A.alloc('gel_skirt_up', 13, 5, 'gel_up', { light: 0.24, part: 'skirt' });
  A.alloc('gel_skirt_up_lr', 5, 13, 'gel_up', { light: 0.24, part: 'skirt' });

  // ---------- drips ----------
  A.alloc('gel_drip_stem', 3, 4, 'gel_side', { light: 0.18, part: 'drip' });
  A.alloc('gel_drip_bead', 4, 4, 'gel_side', { light: 0.34, part: 'drip' });
  A.alloc('gel_drip_bead_up', 4, 4, 'gel_up', { light: 0.46, part: 'drip' });

  // ---------- lobes / stub arms ----------
  for (const s of ['l', 'r']) for (const i of [1, 2, 3]) A.alloc('gel_lobe_' + s + i, 6, 6, 'gel_side', { light: 0.34 + i * 0.10, part: 'lobe' });
  A.alloc('gel_lobe_back_up', 9, 9, 'gel_up', { light: 0.5, part: 'lobe' });
  A.alloc('gel_lobe_up', 8, 8, 'gel_up', { light: 0.52, part: 'lobe' });
  A.alloc('gel_apron', 13, 3, 'gel_side', { light: 0.04, part: 'skirt' });
  A.alloc('gel_lobe_back', 9, 8, 'gel_side', { light: 0.16, part: 'lobe' });

  // ---------- top knob + antennae ----------
  A.alloc('gel_knob', 6, 5, 'gel_side', { light: 0.9, part: 'knob' });
  A.alloc('gel_knob_up', 6, 6, 'gel_up', { light: 1.0, part: 'knob' });
  A.alloc('gel_stalk', 3, 4, 'gel_side', { light: 0.72, part: 'antenna' });
  A.alloc('acid_bulb', 4, 4, 'acid_glow', { shape: 'bulb' });
  A.alloc('acid_bulb_up', 4, 4, 'acid_up', { shape: 'bulb' });

  // ---------- eyes ----------
  A.alloc('eye_sclera', 4, 4, 'eye', {});
  A.alloc('eye_iris', 3, 3, 'eye_glow', {});
  A.alloc('eye_spark', 2, 2, 'eye_spark', {});
  A.alloc('eye_lid', 4, 1, 'gel_lid', {});
  A.alloc('eye_lid_side', 2, 1, 'gel_lid', {});
  A.alloc('eye_lid_up', 4, 2, 'gel_up', { light: 0.56, part: 'lid' });

  // ---------- brow / mouth / maw ----------
  A.alloc('brow_dark', 5, 2, 'brow', {});
  A.alloc('brow_up', 5, 2, 'gel_up', { light: 0.6, part: 'brow' });
  A.alloc('lip_grin', 7, 3, 'lip', {});
  A.alloc('lip_up', 7, 1, 'gel_up', { light: 0.62, part: 'lip' });
  A.alloc('fang_up', 2, 2, 'tooth', { size: 'big' });
  A.alloc('fang_dn', 2, 2, 'tooth', { size: 'small' });
  A.alloc('maw_inner', 8, 4, 'maw', {});
  A.alloc('maw_floor', 8, 3, 'maw_floor', {});
  A.alloc('tooth_up', 2, 2, 'tooth', { size: 'big' });
  A.alloc('tooth_dn', 2, 2, 'tooth', { size: 'small' });
  A.alloc('tongue_side', 2, 1, 'tongue', {});
  A.alloc('tongue', 5, 1, 'tongue', {});
  A.alloc('tongue_up', 5, 2, 'tongue_up', {});

  // ---------- glowing belly core ----------
  A.alloc('core_gem', 6, 2, 'core', {});
  A.alloc('core_gem_side', 2, 3, 'core', {});
  A.alloc('core_gem_up', 6, 2, 'core_up', {});
  A.alloc('core_glow', 3, 2, 'core_glow', {});

  // ---------- crystals ----------
  A.alloc('xtal_a', 4, 6, 'crystal', { light: 0.35 });
  A.alloc('xtal_b', 3, 5, 'crystal', { light: 0.5 });
  A.alloc('xtal_c', 3, 4, 'crystal', { light: 0.65 });
  A.alloc('xtal_top_l', 4, 4, 'crystal_top', { light: 0.5 });
  A.alloc('xtal_top', 3, 3, 'crystal_top', { light: 0.5 });
  A.alloc('xtal_tip', 2, 2, 'crystal_glow', {});

  // ---------- floating gel beads (liveliness) ----------
  A.alloc('bead', 3, 3, 'acid_glow', { shape: 'bead' });
  A.alloc('bead_up', 3, 3, 'acid_up', { shape: 'bead' });

  // ---------- hand-painted extras ----------

  return A;
}

module.exports = { build: build };
