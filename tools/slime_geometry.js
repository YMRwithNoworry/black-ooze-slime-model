'use strict';
// =====================================================================================
// ACID GEL SLIME — geometry / rig.  OWNER: lead (recovered from the modeler's task).
//
// Contract:  module.exports = function build(ctx) -> { model, notes }
//   ctx.model : tools/lib/model.js Model ; ctx.atlas : tools/slime_atlas.js Atlas
//   front = -Z, right = +X, up = +Y, feet at y = 0.  Symmetric about x = 0 except where the
//   design wants organic asymmetry (crystals, drips, beads, right arm).
//   Every face maps to a tile from tools/slime_atlas.js.  Where a face is deliberately a
//   different size than its tile (tiny teeth/tongue, thin seams) the raw tile rect is used
//   with { quiet:true } so the build's warning list stays meaningful.
// =====================================================================================
const { Model } = require('./lib/model.js');

module.exports = function build(ctx) {
  const model = ctx.model || new Model({ identifier: 'acid_gel_slime' });
  const A = ctx.atlas;
  const V = A.get('void_px').rect;
  const SEAM = A.get('seam_dark').rect;
  const F = (tile, size) => A.face(tile, size);
  const raw = (tile) => A.get(tile).rect.slice();
  const Q = { quiet: true };

  // ------------------------------------------------------------------ roots
  model.bone('all', { pivot: [0, 0, 0] });
  model.bone('gel_slime', { parent: 'all', pivot: [0, 0, 0] });

  // ------------------------------------------------------------------ puddle (skirt)
  model.bone('skirt', { parent: 'gel_slime', pivot: [0, 3, 0] });
  const skirtSide = (w, h) => F(w >= 12 ? 'gel_skirt_long' : 'gel_skirt_short', [w, h]);
  const skirtCubes = [
    //   name        x0     y0  z0     x1    y1  z1
    ['skirt_f', -6.5, 0, -11, 6.5, 3, -6],
    ['skirt_b', -6.5, 0, 6, 6.5, 3, 11],
    ['skirt_l', -11, 0, -6.5, -6, 3, 6.5],
    ['skirt_r', 6, 0, -6.5, 11, 3, 6.5],
    // rounded corners turn the cross into a puddle blob
    ['skirt_c_fl', -11, 0, -11, -6, 3, -6],
    ['skirt_c_fr', 6, 0, -11, 11, 3, -6],
    ['skirt_c_bl', -11, 0, 6, -6, 3, 11],
    ['skirt_c_br', 6, 0, 6, 11, 3, 11],
  ];
  for (const [n, x0, y0, z0, x1, y1, z1] of skirtCubes) {
    const sx = x1 - x0, sy = y1 - y0, sz = z1 - z0;
    const zFace = skirtSide(sx, sy);
    const xFace = skirtSide(sz, sy);
    const upT = F(sx >= sz ? 'gel_skirt_up' : 'gel_skirt_up_lr', [sx, sz]);
    model.cube('skirt', n, [x0, y0, z0], [x1, y1, z1], {
      north: zFace, south: zFace, east: xFace, west: xFace, up: upT, down: SEAM,
    }, Q);
  }
  // front apron + back hump are declared with the body below

  // ------------------------------------------------------------------ drips
  model.bone('drip_f', { parent: 'skirt', pivot: [0, 3, -9.5] });
  model.bone('drip_l', { parent: 'skirt', pivot: [-9, 3, -2] });
  model.bone('drip_r', { parent: 'skirt', pivot: [8.5, 3, 3] });
  // each drip = a stem that emerges from under the body and a fat bead hanging on the rim
  const drips = [
    //  bone      stem x0 y0  z0      x1  y1   z1      bead x0  y0 z0    x1   y1  z1
    ['drip_f', -1.5, 1.5, -11.4, 1.5, 5.5, -8.4, -2, 0, -12.3, 2, 4, -8.3],
    ['drip_l', -11.4, 1.5, -3.5, -8.4, 5.5, -0.5, -12.3, 0, -4, -8.3, 4, 0],
    ['drip_r', 8.4, 2.0, 2.0, 11.4, 6.0, 5.0, 8.3, 0.5, 1.5, 12.3, 4.5, 5.5],
  ];
  for (const d of drips) {
    const [bone, sx0, sy0, sz0, sx1, sy1, sz1, bx0, by0, bz0, bx1, by1, bz1] = d;
    const side = F('gel_drip_stem', [3, 4]);
    const up = F('gel_drip_stem', [Math.abs(sx1 - sx0), Math.abs(sz1 - sz0)]);
    model.cube(bone, bone + '_stem', [sx0, sy0, sz0], [sx1, sy1, sz1], {
      north: side, south: side, east: side, west: side, up: up, down: SEAM,
    }, Q);
    const bx = Math.abs(bx1 - bx0), by = Math.abs(by1 - by0), bz = Math.abs(bz1 - bz0);
    const beadSide = F('gel_drip_bead', [bx, by]);
    model.cube(bone, bone + '_bead', [bx0, by0, bz0], [bx1, by1, bz1], {
      north: beadSide, south: beadSide,
      east: F('gel_drip_bead', [bz, by]), west: F('gel_drip_bead', [bz, by]),
      up: F('gel_drip_bead_up', [bx, bz]), down: SEAM,
    }, Q);
  }

  // ------------------------------------------------------------------ main mass
  model.bone('body', { parent: 'gel_slime', pivot: [0, 4, 0] });
  model.bone('dome', { parent: 'body', pivot: [0, 4, 0] });

  // dome profile: A = wide(-z) cube, B = deep cube, crossed for an octagonal footprint
  const DOME = [
    //  name  y0 y1   aHalf aDepth bHalf bDepth
    ['L1', 2, 6, 9, 6, 6, 9],
    ['L2', 6, 9, 8.5, 5.5, 5.5, 8.5],
    ['L3', 9, 12, 7.5, 5, 5, 7.5],
    ['L4', 12, 14, 6.5, 4.5, 4.5, 6.5],
    ['L5', 14, 16, 5, 3.5, 3.5, 5],
    ['L6', 16, 18, 4, 3, 3, 4],
  ];
  DOME.forEach((L, i) => {
    const [n, y0, y1, aHalf, aDepth, bHalf, bDepth] = L;
    const h = y1 - y0;
    const top = i === DOME.length - 1;
    const upT = top ? F('gel_top_ring', [2 * aHalf, 2 * aDepth]) : SEAM;
    const downT = i === 0 ? F('gel_under', [2 * aHalf, 2 * aDepth]) : SEAM;
    model.cube('dome', n + '_a', [-aHalf, y0, -aDepth], [aHalf, y1, aDepth], {
      north: F('gel_' + n + '_long', [2 * aHalf, h]), south: F('gel_' + n + '_long', [2 * aHalf, h]),
      east: F('gel_' + n + '_short', [2 * aDepth, h]), west: F('gel_' + n + '_short', [2 * aDepth, h]),
      up: upT, down: downT,
    }, Q);
    model.cube('dome', n + '_b', [-bHalf, y0, -bDepth], [bHalf, y1, bDepth], {
      north: F('gel_' + n + '_short', [2 * bHalf, h]), south: F('gel_' + n + '_short', [2 * bHalf, h]),
      east: F('gel_' + n + '_long', [2 * bDepth, h]), west: F('gel_' + n + '_long', [2 * bDepth, h]),
      up: top ? F('gel_top_ring_b', [2 * bHalf, 2 * bDepth]) : SEAM,
      down: SEAM,
    }, Q);
  });
  model.cube('dome', 'L7_a', [-2.5, 18, -2.5], [2.5, 19, 2.5], {
    north: F('gel_L7_long', [5, 1]), south: F('gel_L7_long', [5, 1]),
    east: F('gel_L7_short', [5, 1]), west: F('gel_L7_short', [5, 1]),
    up: F('gel_top_cap', [5, 5]), down: SEAM,
  }, Q);

  // front apron (a gel lip slumping over the puddle's front wall) + back hump
  model.bone('lobe_front', { parent: 'body', pivot: [0, 7, -9.5] });
  model.cube('lobe_front', 'apron_front', [-6.5, 0, -12.1], [6.5, 2.5, -10.9], {
    north: F('gel_apron', [13, 2.5]), south: F('gel_apron', [13, 2.5]),
    east: F('gel_skirt_short', [1.2, 2.5]), west: F('gel_skirt_short', [1.2, 2.5]),
    up: F('gel_skirt_up', [13, 1.2]), down: SEAM,
  }, Q);
  model.bone('lobe_back', { parent: 'body', pivot: [0, 8, 9.5] });
  model.cube('lobe_back', 'hump_back', [-4.5, 3, 2.5], [4.5, 11, 11.5], {
    north: F('gel_lobe_back', [9, 8]), south: F('gel_lobe_back', [9, 8]),
    east: F('gel_lobe_back', [9, 8]), west: F('gel_lobe_back', [9, 8]),
    up: F('gel_lobe_back_up', [9, 9]), down: SEAM,
  }, Q);

  // ------------------------------------------------------------------ glowing belly core
  model.bone('core', { parent: 'body', pivot: [0, 4, -6] });
  model.cube('core', 'core_gem', [-3, 2.6, -9.7], [3, 4.6, -8.9], {
    north: F('core_gem', [6, 2]), south: null,
    east: F('core_gem_side', [0.8, 2]), west: F('core_gem_side', [0.8, 2]),
    up: F('core_gem_up', [6, 0.8]), down: F('core_gem_up', [6, 0.8]),
  }, Q);
  model.cube('core', 'core_glow', [-1.5, 3.0, -9.85], [1.5, 4.2, -9.75], {
    north: F('core_glow', [3, 1.2]), south: null,
    east: F('core_glow', [0.1, 1.2]), west: F('core_glow', [0.1, 1.2]),
    up: F('core_glow', [3, 0.1]), down: F('core_glow', [3, 0.1]),
  }, Q);

  // ------------------------------------------------------------------ arms (3-cube chains)
  const arm = (side) => {
    const s = side < 0 ? 'l' : 'r';
    // left is the reference arm; the right one is shifted half a pixel for organic asymmetry
    const dy = side < 0 ? 0 : 0.5;
    const dx = side < 0 ? 0 : 0.5;
    const px = (x) => side * (Math.abs(x) + dx);
    const seg1 = [px(-12), 6 + dy, -3, px(-6), 12 + dy, 3];
    const seg2 = [px(-13), 2.5 + dy, -3, px(-7), 8.5 + dy, 3];
    const seg3 = [px(-12.5), 0 + (side < 0 ? 0 : 0.5), -3, px(-6.5), 6 + (side < 0 ? 0 : 0.5), 3];
    const cubeOf = (bone, name, box, tile) => {
      const [x0, y0, z0, x1, y1, z1] = box;
      const from = [Math.min(x0, x1), y0, z0], to = [Math.max(x0, x1), y1, z1];
      model.cube(bone, name, from, to, {
        north: F(tile, [6, 6]), south: F(tile, [6, 6]),
        east: F(tile, [6, 6]), west: F(tile, [6, 6]),
        up: F('gel_lobe_up', [6, 6]), down: SEAM,
      }, Q);
    };
    model.bone('lobe_' + s, { parent: 'body', pivot: [side * 9, 8, 0] });
    cubeOf('lobe_' + s, 'lobe_' + s + '1', seg1, 'gel_lobe_' + s + '1');
    model.bone('lobe_' + s + '2', { parent: 'lobe_' + s, pivot: [side * 11, 7.5, 0] });
    cubeOf('lobe_' + s + '2', 'lobe_' + s + '2', seg2, 'gel_lobe_' + s + '2');
    model.bone('lobe_' + s + '3', { parent: 'lobe_' + s + '2', pivot: [side * 12, 5.5 + dy, 0] });
    cubeOf('lobe_' + s + '3', 'lobe_' + s + '3', seg3, 'gel_lobe_' + s + '3');
  };
  arm(-1); arm(1);

  // ------------------------------------------------------------------ crystals
  model.bone('crystals', { parent: 'body', pivot: [0, 12, 4] });
  //  shard = [w,h,d], pos = base centre (sunk ~0.4 into the dome), rot = [x,y,z] degrees
  const SHARDS = [
    { name: 'crystal_1', size: [4, 6, 4], pos: [-4, 6.8, 7.8], rot: [28, 0, -6], tile: 'xtal_a', tip: 2 },
    { name: 'crystal_2', size: [4, 6, 4], pos: [-4.6, 15.3, 2.0], rot: [8, 0, 22], tile: 'xtal_a', tip: 2 },
    { name: 'crystal_3', size: [3, 4, 3], pos: [3.5, 5.0, 5.8], rot: [32, 0, 6], tile: 'xtal_c', tip: 2 },
    { name: 'crystal_4', size: [3, 4, 3], pos: [1.0, 17.1, 3.0], rot: [10, 0, 14], tile: 'xtal_c', tip: 2 },
    { name: 'crystal_5', size: [3, 5, 3], pos: [-4.1, 9.6, 7.0], rot: [18, 0, -12], tile: 'xtal_b', tip: 2 },
  ];
  for (const sh of SHARDS) {
    const [w, h, d] = sh.size;
    const [cx, cy, cz] = sh.pos;
    const origin = [cx, cy, cz];
    model.bone(sh.name, { parent: 'crystals', pivot: origin });
    const half = [w / 2, h / 2, d / 2];
    // shard: pivot sits at its base centre
    model.cube(sh.name, sh.name + '_shard',
      [cx - half[0], cy, cz - half[2]], [cx + half[0], cy + h, cz + half[2]], {
        north: F(sh.tile, [w, h]), south: F(sh.tile, [w, h]),
        east: F(sh.tile, [d, h]), west: F(sh.tile, [d, h]),
        up: F(w === 4 ? 'xtal_top_l' : 'xtal_top', [w, d]), down: F(sh.tile, [w, d]),
      }, { rotation: sh.rot, origin });
    // glowing tip, half sunk into the shard's top, same pivot so it stays aligned
    const t = sh.tip, ty = cy + h;
    model.cube(sh.name, sh.name + '_tip',
      [cx - t / 2, ty - t / 2, cz - t / 2], [cx + t / 2, ty + t / 2, cz + t / 2], {
        north: F('xtal_tip', [t, t]), south: F('xtal_tip', [t, t]),
        east: F('xtal_tip', [t, t]), west: F('xtal_tip', [t, t]),
        up: F('xtal_tip', [t, t]), down: null,
      }, { rotation: sh.rot, origin, quiet: true });
  }

  // ------------------------------------------------------------------ top knob + antennae
  model.bone('jelly_top', { parent: 'body', pivot: [0, 16, 0] });
  model.cube('jelly_top', 'knob', [-3, 18.5, -3], [3, 21, 3], {
    north: F('gel_knob', [6, 2.5]), south: F('gel_knob', [6, 2.5]),
    east: F('gel_knob', [6, 2.5]), west: F('gel_knob', [6, 2.5]),
    up: F('gel_knob_up', [6, 6]), down: SEAM,
  }, Q);
  // glow-tipped antennae: a 3-cube stalk tilted 50 degrees outward with a lagging bulb bone
  for (const side of [-1, 1]) {
    const s = side < 0 ? 'l' : 'r';
    const tilt = side < 0 ? 50 : -50;
    const px = [-side * 3, 20.5, -1];                     // declared bone pivot
    const tipPivot = [-side * 3.8, 21.1, -1];
    model.bone('antenna_' + s, { parent: 'jelly_top', pivot: px });
    model.cube('antenna_' + s, 'stalk_' + s, [px[0] - 1.5, 19, -2.5], [px[0] + 1.5, 22, 0.5], {
      north: F('gel_stalk', [3, 3]), south: F('gel_stalk', [3, 3]),
      east: F('gel_stalk', [3, 3]), west: F('gel_stalk', [3, 3]),
      up: F('gel_stalk', [3, 3]), down: SEAM,
    }, { rotation: [0, 0, tilt], origin: px, quiet: true });
    model.bone('bulb_' + s, { parent: 'antenna_' + s, pivot: tipPivot });
    model.cube('bulb_' + s, 'bulb_' + s, [px[0] - 1, 21.5, -2], [px[0] + 1, 23.5, 0], {
      north: F('acid_bulb', [2, 2]), south: F('acid_bulb', [2, 2]),
      east: F('acid_bulb', [2, 2]), west: F('acid_bulb', [2, 2]),
      up: F('acid_bulb_up', [2, 2]), down: null,
    }, { rotation: [0, 0, tilt], origin: px, quiet: true });
  }

  // ------------------------------------------------------------------ floating gel beads
  model.bone('bead_l', { parent: 'body', pivot: [-13, 13, -2] });
  model.cube('bead_l', 'bead_l', [-14.5, 11, -3.5], [-11.5, 14, -0.5], {
    north: F('bead', [3, 3]), south: F('bead', [3, 3]),
    east: F('bead', [3, 3]), west: F('bead', [3, 3]),
    up: F('bead_up', [3, 3]), down: SEAM,
  }, Q);
  model.bone('bead_r', { parent: 'body', pivot: [13, 14, 3] });
  model.cube('bead_r', 'bead_r', [11.5, 11.5, 1.5], [14.5, 14.5, 4.5], {
    north: F('bead', [3, 3]), south: F('bead', [3, 3]),
    east: F('bead', [3, 3]), west: F('bead', [3, 3]),
    up: F('bead_up', [3, 3]), down: SEAM,
  }, Q);

  // ------------------------------------------------------------------ face
  model.bone('face', { parent: 'body', pivot: [0, 10.5, 0] });
  for (const side of [-1, 1]) {
    const s = side < 0 ? 'l' : 'r';
    const name = 'eye_' + s;
    const sx = (v) => side * v;
    model.bone(name, { parent: 'face', pivot: [side * 3, 10, -8.5] });
    const sc = [Math.min(sx(5), sx(1)), 8, -9.5];
    model.cube(name, name + '_sclera', sc, [Math.max(sx(5), sx(1)), 12, -7.4], {
      north: F('eye_sclera', [4, 4]), south: V,
      east: F('eye_sclera', [2.1, 4]), west: F('eye_sclera', [2.1, 4]),
      up: SEAM, down: SEAM,
    }, Q);
    model.cube(name, name + '_iris',
      [Math.min(sx(4.5), sx(1.5)), 8.9, -9.62], [Math.max(sx(4.5), sx(1.5)), 11.3, -9.52], {
        north: F('eye_iris', [3, 2.4]), south: null,
        east: F('eye_iris', [0.1, 2.4]), west: F('eye_iris', [0.1, 2.4]),
        up: F('eye_iris', [3, 0.1]), down: F('eye_iris', [3, 0.1]),
      }, Q);
    // big specular: upper outer third of the iris, mirrored on both eyes
    model.cube(name, name + '_spark',
      [Math.min(sx(4.2), sx(3.2)), 10.2, -9.68], [Math.max(sx(4.2), sx(3.2)), 11.2, -9.58], {
        north: F('eye_spark', [1, 1]), south: null,
        east: F('eye_spark', [0.1, 1]), west: F('eye_spark', [0.1, 1]),
        up: F('eye_spark', [1, 0.1]), down: F('eye_spark', [1, 0.1]),
      }, Q);
    model.cube(name, name + '_lid',
      [Math.min(sx(5), sx(1)), 11.6, -9.62], [Math.max(sx(5), sx(1)), 12.6, -7.9], {
        north: F('eye_lid', [4, 1]), south: V,
        east: F('eye_lid_side', [1.7, 1]), west: F('eye_lid_side', [1.7, 1]),
        up: F('eye_lid_up', [4, 1.7]), down: SEAM,
      }, Q);
  }
  // angry-able brows sitting on the eye tops
  for (const side of [-1, 1]) {
    const s = side < 0 ? 'l' : 'r';
    const name = 'brow_' + s;
    const sx = (v) => side * v;
    model.bone(name, { parent: 'face', pivot: [side * 4.5, 13.2, -8.4] });
    model.cube(name, name + '_bar', [Math.min(sx(5.5), sx(0.5)), 11.8, -9.4],
      [Math.max(sx(5.5), sx(0.5)), 13.8, -7.6], {
        north: F('brow_dark', [5, 2]), south: F('brow_dark', [5, 2]),
        east: SEAM, west: SEAM,
        up: F('brow_up', [5, 1.8]), down: SEAM,
      }, { quiet: true, rotation: [0, 0, side < 0 ? -12 : 12], origin: [side * 4.5, 13.2, -8.4] });
  }
  // frozen grin: the lip plate hides everything behind it
  model.bone('mouth', { parent: 'face', pivot: [0, 5.4, -8.4] });
  model.cube('mouth', 'lip', [-3.5, 4.4, -9.9], [3.5, 7.7, -8.9], {
    north: F('lip_grin', [7, 3]), south: null,
    east: F('lip_grin', [1, 3]), west: F('lip_grin', [1, 3]),
    up: F('lip_up', [7, 1]), down: SEAM,
  }, Q);
  for (const [n, x0, x1, y0, y1, tile] of [
    ['fang_ul', -2.6, -1.6, 3.6, 4.6, 'fang_up'],   // upper fangs poking below the grin
    ['fang_ur', 1.6, 2.6, 3.6, 4.6, 'fang_up'],
    ['fang_ll', -1.8, -0.8, 7.7, 8.3, 'fang_dn'],   // lower fangs poking above it
    ['fang_lr', 0.8, 1.8, 7.7, 8.3, 'fang_dn'],
  ]) {
    const t = raw(tile);
    model.cube('mouth', n, [x0, y0, -9.8], [x1, y1, -8.95], {
      north: t, south: null, east: t, west: t, up: t, down: t,
    }, Q);
  }
  // hidden fang ring + tongue: only revealed when the animation opens the jaw
  model.bone('maw', { parent: 'mouth', pivot: [0, 5.4, -7.4] });
  model.cube('maw', 'maw_inner', [-3.5, 4.2, -8.85], [3.5, 7.6, -6.6], {
    north: F('maw_inner', [7, 3.4]), south: V,
    east: F('maw_inner', [2.25, 3.4]), west: F('maw_inner', [2.25, 3.4]),
    up: F('maw_inner', [7, 2.25]), down: F('maw_floor', [7, 2.25]),
  }, Q);
  const upperTeeth = [[-3.4, -1.4], [-1, 1], [1.4, 3.4]];
  upperTeeth.forEach(([x0, x1], i) => {
    const t = raw('tooth_up');
    model.cube('maw', 'tooth_up_' + (i + 1), [x0, 6.0, -8.7], [x1, 7.8, -7.7], {
      north: t, south: t, east: t, west: t, up: t, down: t,
    }, Q);
  });
  model.bone('jaw', { parent: 'mouth', pivot: [0, 4.4, -8.9] });
  [[-2.6, -0.6], [0.6, 2.6]].forEach(([x0, x1], i) => {
    const t = raw('tooth_dn');
    model.cube('jaw', 'tooth_dn_' + (i + 1), [x0, 4.2, -8.6], [x1, 6.0, -7.6], {
      north: t, south: t, east: t, west: t, up: t, down: t,
    }, Q);
  });
  const tg = raw('tongue'), tgu = raw('tongue_up');
  model.cube('jaw', 'tongue', [-2.5, 4.2, -8.5], [2.5, 5.2, -6.7], {
    north: tg, south: tg, east: raw('tongue_side'), west: raw('tongue_side'), up: tgu, down: tgu,
  }, Q);

  return { model, notes: 'full rig: arms, crystals, antennae+bulbs, drips, beads, brows, maw fangs' };
};
