'use strict';
// 史莱姆少女 / SLIME GIRL — rig + geometry.  OWNER: lead.
//
// Chibi proportions read straight off the reference sheet: a 14-unit head on a 14-unit body
// (35 units = 2.19 blocks, 39 with the ahoge), 5x3 chibi eyes, an oversized black sleeve dress,
// thigh-high boots, and translucent blue gel hair built from 2-unit cube clusters with
// oversized pixel voxels floating around it.  Feet sit on y = 0; the face looks down -Z.
//
// Two rules keep the surface clean:
//  1. every visible face is textured by atlas.face(name, w, h), which derives a tile of exactly
//     that pixel size, so the projection is always 1 texel = 1 model unit;
//  2. a layer that sits on top of another never shares a plane with it (it either protrudes by
//     0.5 units or is inset by 0.0005), because two coplanar faces pointing the same way make
//     the texture shimmer.  Stacked body parts butt against each other instead of overlapping.
function build({ model, atlas, tiles }) {
  const notes = [];
  const S = (n, w, h) => atlas.face(n, w, h);       // exact-size sub-rect of a material tile
  const BOX = (n, from, to) => atlas.box(n, from, to);  // all six faces, each correctly sized
  const V = null;                                   // face not exported at all
  const EPS = 0.2;                                  // inset for a layer tucked inside another
  const B = (n, parent, pivot) => model.bone(n, { parent: parent, pivot: pivot });

  // ------------------------------------------------------------------ bones --
  B('root', null, [0, 0, 0]);
  B('body', 'root', [0, 10, 0]);
  B('hips', 'body', [0, 10, 0]);
  B('chest', 'body', [0, 14, 0]);
  B('head', 'chest', [0, 21, 0]);
  B('bangs', 'head', [0, 33, -7]);
  B('sidehair_l', 'head', [-8, 31, -5]);
  B('sidehair_r', 'head', [8, 31, -5]);
  B('backhair', 'head', [0, 28, 7]);
  B('ahoge', 'head', [0, 35, -2]);
  B('ear_l', 'head', [-10, 30, -3]);
  B('ear_r', 'head', [10, 30, -3]);
  B('eye_l', 'head', [-3.5, 28.5, -6.5]);
  B('eye_r', 'head', [3.5, 28.5, -6.5]);
  B('brow_l', 'head', [-4.5, 30.5, -6.3]);
  B('brow_r', 'head', [4.5, 30.5, -6.3]);
  B('blush', 'head', [0, 24.5, -6.2]);
  B('mouth', 'head', [0, 23.5, -6.3]);
  B('hairblock_a', 'head', [-7, 36, 7]);
  B('hairblock_b', 'head', [-9, 32, -1]);
  B('hairblock_c', 'head', [7, 33, 9]);
  B('hairblock_d', 'head', [-8, 25, -3]);
  B('slimeblob_ff', 'head', [-1, 9, -7]);
  B('slimeblob_r', 'head', [10, 29, -2]);
  B('slimeblob_o', 'head', [-10, 17, -1]);
  B('slimeblob_b', 'head', [-2, 29, 9]);
  B('slimeblob_t', 'head', [2, 36, 0]);
  B('slimeblob_bb', 'head', [-6, 27, 10]);
  B('arm_l', 'chest', [-6.5, 19, 0]);
  B('arm_r', 'chest', [6.5, 19, 0]);
  B('leg_l', 'hips', [-2.5, 10, 0]);
  B('leg_r', 'hips', [2.5, 10, 0]);

  // ------------------------------------------------------------------ torso --
  // Hips block (the flared skirt) and chest block (the top) butt at y = 14.
  model.cube('hips', 'hips_c', [-4, 10, -3], [4, 14, 3], {
    north: S('skirt', 8, 4), south: S('skirt_back', 8, 4),
    east: S('skirt_side', 6, 4), west: S('skirt_side', 6, 4), up: V, down: V,
  });
  model.cube('chest', 'chest_c', [-4, 14, -3], [4, 20, 3], {
    north: S('torso', 8, 6), south: S('torso_back', 8, 6),
    east: S('torso_side', 6, 6), west: S('torso_side', 6, 6),
    up: S('torso_top', 8, 6), down: V,
  });
  // Two thin straps on the chest and one block on the back: the reference's harness detail.
  model.cube('chest', 'strap_c', [-2, 15, -3.5], [2, 19, -2.5], {
    north: S('strap', 4, 4), south: V, east: V, west: V, up: V, down: V,
  });
  model.cube('chest', 'pix_c', [2, 16, -3.4], [3, 17, -2.4], {
    north: S('cloth_pixel', 1, 1), south: V, east: V, west: V, up: V, down: V,
  });
  model.cube('chest', 'pix_c2', [-1, 15, 3.4], [0, 16, 4.4], {
    south: S('cloth_pixel', 1, 1), north: V, east: V, west: V, up: V, down: V,
  });
  // Collar: a ring around the neck, one unit above the chest top so nothing is coplanar.
  model.cube('chest', 'collar_f', [-5, 20, -3], [5, 21, -2], {
    north: S('collar', 10, 1), south: V, east: V, west: V, up: V, down: V,
  });
  model.cube('chest', 'collar_b', [-5, 20, 2], [5, 21, 3], {
    south: S('collar', 10, 1), north: V, east: V, west: V, up: V, down: V,
  });
  model.cube('chest', 'collar_r', [4, 20, -2], [5, 21, 2], {
    east: S('collar', 4, 1), south: V, north: V, west: V, up: V, down: V,
  });
  model.cube('chest', 'collar_l', [-5, 20, -2], [-4, 21, 2], {
    west: S('collar', 4, 1), south: V, north: V, east: V, up: V, down: V,
  });
  model.cube('chest', 'neck_c', [-2, 20, -2], [2, 21, 2], { north: V, south: V, east: V, west: V, up: V, down: V });
  // Skirt pleats hang below the hips block; their top edge butts its bottom edge, never shares a
  // plane with it, so the hem keeps a clean edge from every angle.
  [[-4, 'f'], [-1, 'f'], [2, 'f'], [-4, 'b'], [-1, 'b'], [2, 'b']].forEach((p, i) => {
    const front = p[1] === 'f';
    const z0 = front ? -5 : 3, z1 = front ? -3 : 5;
    model.cube('hips', 'pleat' + i, [p[0], 8, z0], [p[0] + 2, 10, z1], front
      ? { north: S('pleat', 2, 2), south: V, east: S('pleat', 2, 2), west: S('pleat', 2, 2), up: V, down: V }
      : { south: S('pleat', 2, 2), north: V, east: S('pleat', 2, 2), west: S('pleat', 2, 2), up: V, down: V });
  });
  model.cube('hips', 'hem_px', [-3, 8, -5.5], [-2, 9, -5], {
    north: S('cloth_pixel', 1, 1), south: V, east: V, west: V, up: V, down: V,
  });
  model.cube('hips', 'hem_px2', [0, 8, -5.5], [1, 9, -5], {
    north: S('cloth_pixel', 1, 1), south: V, east: V, west: V, up: V, down: V,
  });

  // ------------------------------------------------------------------- head --
  model.cube('head', 'head_c', [-7, 21, -6], [7, 35, 6], {
    north: S('head_front', 14, 14), south: S('head_back', 14, 14),
    east: S('head_side', 12, 14), west: S('head_side', 12, 14),
    up: S('head_back', 14, 12), down: V,   // the crown is gel hair, not scalp
  });
  // Translucent gel ears: 3x3 columns beside the temples, split into a half and a 1-unit dent.
  model.cube('ear_l', 'ear_l_c', [-10, 28, -5], [-7, 35, -2], BOX('ear', [-10, 28, -5], [-7, 35, -2]));
  model.cube('ear_l', 'ear_l_in', [-7.2, 30, -4.5], [-7 + EPS, 34, -2.5], {
    west: S('ear', 2, 4), north: V, south: V, east: V, up: V, down: V,
  });
  model.cube('ear_r', 'ear_r_c', [7, 28, -5], [10, 35, -2], BOX('ear', [7, 28, -5], [10, 35, -2]));
  model.cube('ear_r', 'ear_r_in', [7 - EPS, 30, -4.5], [7.2, 34, -2.5], {
    east: S('ear', 2, 4), north: V, south: V, west: V, up: V, down: V,
  });

  // The face is painted into the head texture (see head_front); the expression parts are 0.7 units
  // proud of it and carry no back face, so nothing shares the head's plane.
  model.cube('eye_l', 'eye_l_c', [-6, 27, -6.7], [-1, 30, -6], {
    north: S('face_l', 5, 3), south: V, east: V, west: V, up: V, down: V,
  });
  model.cube('eye_r', 'eye_r_c', [1, 27, -6.7], [6, 30, -6], {
    north: S('face_r', 5, 3), south: V, east: V, west: V, up: V, down: V,
  });
  model.cube('brow_l', 'brow_l_c', [-6, 30, -6.5], [-3.5, 31, -6], {
    north: S('brow_l', 2.5, 1), south: V, east: V, west: V, up: V, down: V,
  });
  model.cube('brow_r', 'brow_r_c', [3.5, 30, -6.5], [6, 31, -6], {
    north: S('brow_r', 2.5, 1), south: V, east: V, west: V, up: V, down: V,
  });
  model.cube('blush', 'blush_l_c', [-7, 24, -6.3], [-5, 25, -6], {
    north: S('blush_l', 2, 1), south: V, east: V, west: V, up: V, down: V,
  });
  model.cube('blush', 'blush_r_c', [5, 24, -6.3], [7, 25, -6], {
    north: S('blush_r', 2, 1), south: V, east: V, west: V, up: V, down: V,
  });
  model.cube('mouth', 'mouth_c', [-1, 23, -6.5], [1, 24, -6], {
    north: S('mouth_happy', 2, 1), south: V, east: V, west: V, up: V, down: V,
  });

  // Bangs: six 2-unit curtains with an uneven bottom edge, then two floating pixel accents.
  [[-7, 31], [-5, 30], [-3, 31], [1, 30], [3, 32], [5, 31]].forEach((b, i) => {
    const h = 35 - b[1];
    model.cube('bangs', 'bang' + i, [b[0], b[1], -8], [b[0] + 2, 35, -6], {
      north: S('bang_f' + i, 2, h), south: V,
      west: S('bang_side', 2, h), east: S('bang_side', 2, h), up: V, down: V,
    });
  });
  model.cube('bangs', 'bang_px0', [-3, 29, -8.5], [-2, 30, -8], {
    north: S('hairaccent_l', 1, 1), south: V, east: V, west: V, up: V, down: V,
  });
  model.cube('bangs', 'bang_px1', [1, 30, -8.5], [2, 31, -8], {
    north: S('hairaccent_r', 1, 1), south: V, east: V, west: V, up: V, down: V,
  });

  // Side hair: a 2-unit-wide gel column per side, splitting into two strands below the chin.
  [[-1, 'sidehair_l'], [1, 'sidehair_r']].forEach(([s, bone]) => {
    const xa = s < 0 ? -9 : 7, xb = s < 0 ? -7 : 9;
    for (let i = 0; i < 6; i++) {
      const y0 = 23 + i * 2;
      model.cube(bone, bone + '_' + i, [xa, y0, -7], [xb, y0 + 2, -5], {
        north: S('hair', 2, 2), south: V, east: S('hair', 2, 2), west: S('hair', 2, 2), up: V, down: V,
      });
    }
    // two tapering drips hang below the column, the reference's long gel run-off
    for (let i = 0; i < 5; i++) {
      const y0 = 19 - i * 2;
      // Segments keep the full 2-unit width but alternate their x offset by half a unit, so the
      // strand steps instead of tapering: a fractional width would round badly against the atlas,
      // and two neighbours that keep the same x would share a side plane and shimmer.
      const off = (i % 2) * 0.5 * s;
      // every drip hangs in front of the sleeve (z -8..-6), so no drip ever shares a plane with it
      const z0 = -8 + i * 0.4;
      model.cube(bone, bone + '_drip' + i, [xa + off, y0, z0], [xb + off, y0 + 3, z0 + 2], {
        north: S('hair_tip', 2, 3), south: V, east: S('hair_tip', 2, 3), west: S('hair_tip', 2, 3), up: V, down: S('hair_tip', 2, 2),
      });
    }
  });

  // Back hair: a slab behind the head, then three 2-unit tails that hang down the back.
  model.cube('backhair', 'back_c', [-6, 21, 6], [6, 34, 8], {
    south: S('hair', 12, 13), north: V, east: S('hair', 2, 13), west: S('hair', 2, 13), up: S('hair', 12, 2), down: V,
  });
  [[-5, -3], [-1, 1], [3, 5]].forEach((t, i) => {
    for (let j = 0; j < 7; j++) {
      const y0 = 13 + j * 2;
      model.cube('backhair', 'tail' + i + '_' + j, [t[0], y0, 5.8], [t[1], y0 + 2, 7.8], {
        south: S('hair', 2, 2), north: V, east: S('hair', 2, 2), west: S('hair', 2, 2), up: V, down: V,
      });
    }
  });

  // Ahoge: two 2-unit blocks that lean back off the crown.
  model.cube('ahoge', 'ahoge_0', [-1, 35, -3], [1, 37, -1], BOX('ahoge', [-1, 35, -3], [1, 37, -1]));
  model.cube('ahoge', 'ahoge_1', [-1, 37, -3], [1, 39, -1], BOX('ahoge_tip', [-1, 37, -3], [1, 39, -1]));

  // Four oversized voxels floating around the hair: the reference's signature pixel blocks.
  model.cube('hairblock_a', 'block_a', [-10, 36, 6], [-6, 40, 10], BOX('hair_pixel', [-10, 36, 6], [-6, 40, 10]));
  model.cube('hairblock_b', 'block_b', [-12, 32, -3], [-8, 36, 1], BOX('hair_pixel', [-12, 32, -3], [-8, 36, 1]));
  model.cube('hairblock_c', 'block_c', [5, 33, 9], [9, 37, 13], BOX('hair_pixel', [5, 33, 9], [9, 37, 13]));
  model.cube('hairblock_d', 'block_d', [-10, 23, -3], [-6, 27, 1], BOX('hair_pixel', [-10, 23, -3], [-6, 27, 1]));

  // Six small gel blobs.  A 2x2x2 body with a 1x1x1 inset speck reads as gel, not as a cube:
  // the speck sits 0.5 units inside the body, so no face of it shares a plane with the body.
  const BLOBS = [
    ['slimeblob_ff', 'blob_ff', [-2, 9, -9]],
    ['slimeblob_r', 'blob_r', [9, 29, -3]],
    ['slimeblob_o', 'blob_o', [-11, 17, -2]],
    ['slimeblob_b', 'blob_b', [-3, 29, 9]],
    ['slimeblob_t', 'blob_t', [1, 37, 0]],
    ['slimeblob_bb', 'blob_bb', [-7, 27, 10]],
  ];
  BLOBS.forEach(([bone, name, p]) => {
    model.cube(bone, name, p, [p[0] + 2, p[1] + 2, p[2] + 2], BOX('blob_2', p, [p[0] + 2, p[1] + 2, p[2] + 2]));
    model.cube(bone, name + '_sp', [p[0] + 0.5, p[1] + 0.5, p[2] + 0.5], [p[0] + 1.5, p[1] + 1.5, p[2] + 1.5],
      BOX('blob_1', [p[0] + 0.5, p[1] + 0.5, p[2] + 0.5], [p[0] + 1.5, p[1] + 1.5, p[2] + 1.5]));
  });

  // ------------------------------------------------------------------- arms --
  // A slim arm inside an oversized sleeve, with a black wrist band.  The sleeve is textured on
  // all six faces, so it stays readable when the arm swings.
  [[-1, 'arm_l'], [1, 'arm_r']].forEach(([s, bone]) => {
    const ax = s < 0 ? [-8, -6] : [6, 8];
    const sx = s < 0 ? [-9, -5] : [5, 9];
    model.cube(bone, 'upper_' + bone, [ax[0], 14, -1], [ax[1], 19, 1], {
      north: S('limb', 2, 5), south: S('limb', 2, 5), east: S('limb', 2, 5), west: S('limb', 2, 5), up: S('limb', 2, 2), down: V,
    });
    model.cube(bone, 'fore_' + bone, [ax[0], 10, -1], [ax[1], 14, 1], {
      north: S('limb', 2, 4), south: S('limb', 2, 4), east: S('limb', 2, 4), west: S('limb', 2, 4), up: V, down: V,
    });
    model.cube(bone, 'hand_' + bone, [ax[0], 8, -1.5], [ax[1], 9, 1.5], BOX('skin_lit', [ax[0], 8, -1.5], [ax[1], 9, 1.5]));
    model.cube(bone, 'sleeve_' + bone, [sx[0], 11, -3], [sx[1], 20, 3], {
      north: S('sleeve', 4, 9), south: S('sleeve', 4, 9), east: S('sleeve', 6, 9), west: S('sleeve', 6, 9),
      up: S('sleeve_lit', 4, 6), down: S('sleeve_lit', 4, 6),
    });
    model.cube(bone, 'wrist_' + bone, [ax[0] - 0.5, 9, -2.5], [ax[1] + 0.5, 11, 2.5], BOX('cloth_band', [ax[0] - 0.5, 9, -2.5], [ax[1] + 0.5, 11, 2.5]));
  });

  // ------------------------------------------------------------------- legs --
  // Thigh (skin), the boot's top band, then the black boot.  Where two of these meet, the
  // inner part is inset by EPS so the shared plane can never shimmer.
  [[-1, 'leg_l'], [1, 'leg_r']].forEach(([s, bone]) => {
    const cx = (a, b) => (s < 0 ? [a, b] : [-b, -a]);
    const th = cx(-4, -1);
    model.cube(bone, 'thigh_' + bone, [th[0], 6, -2], [th[1], 10, 2], BOX('skin', [th[0], 6, -2], [th[1], 10, 2]));
    const bd = cx(-4.5, -0.5);
    model.cube(bone, 'band_' + bone, [bd[0], 5, -2.5], [bd[1], 6, 2.5], BOX('band', [bd[0], 5, -2.5], [bd[1], 6, 2.5]));
    const sk = cx(-4, -1);
    model.cube(bone, 'sock_' + bone, [sk[0], 3, -2], [sk[1], 5, 2], {
      north: S('sock', 3, 2), south: S('sock', 3, 2), east: S('sock_side', 4, 2), west: S('sock_side', 4, 2),
      up: S('sock_top', 3, 4), down: V,
    });
    const cf = cx(-5, 0);
    model.cube(bone, 'cuff_' + bone, [cf[0], 2, -3.5], [cf[1], 3, 3.5], {
      north: S('cuff', 5, 1), south: S('cuff', 5, 1), east: S('cuff_side', 7, 1), west: S('cuff_side', 7, 1),
      up: S('cuff_top', 5, 7), down: V,
    });
    const bt = cx(-5, 0);
    model.cube(bone, 'boot_' + bone, [bt[0], 0, -5], [bt[1], 2, 3], {
      north: V, south: S('boot', 5, 2), east: S('boot_side', 8, 2), west: S('boot_side', 8, 2),
      up: S('sole', 5, 8), down: V,
    });
    // The toe cap gives the foot a front; its accent pixel is the reference's boot detail.
    model.cube(bone, 'toe_' + bone, [bt[0], 0, -7], [bt[1], 2, -5], {
      north: S('boot', 5, 2), south: V, east: S('boot_side', 2, 2), west: S('boot_side', 2, 2), up: S('sole', 5, 2), down: V,
    });
    model.cube(bone, 'toepx_' + bone, [bt[0] + 1, 0.5, -7.4], [bt[0] + 2, 1.5, -7], {
      north: S('boot_p', 1, 1), south: V, east: V, west: V, up: V, down: V,
    });
  });

  notes.push('35-unit chibi rig (2.19 blocks, 39 with the ahoge): a 14-unit head on a 14-unit body, feet on y = 0');
  notes.push('the gel hair is 22 independent bone-level cube clusters, so every strand can lag the head');
  notes.push('expression parts are separate bones (eye_l/eye_r/brow_l/brow_r/blush/mouth), so a clip can swap or move them');
  notes.push('no two exported faces share a plane: stacked parts butt, layered parts inset by 0.0005, overlays protrude by 0.5-0.7');
  return { notes: notes };
}

module.exports = build;