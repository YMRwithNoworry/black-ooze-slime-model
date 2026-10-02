'use strict';
// ==========================================================================================
// TEXTURE-FLICKER AUDIT  (z-fighting / "shimmering texture")
// ==========================================================================================
// Two faces that lie on the SAME plane and overlap fight for the same depth value, so the
// renderer picks a winner per pixel *and per frame*: the surface shimmers, and the strip
// where they overlap swaps texture.  This module finds every pair of cube faces that
//   (1) are coplanar (same axis-aligned plane, exact to 1e-3 unit),
//   (2) face the same way (a +x face and a -x face back-to-back never fight - one of them
//       is always back-facing and culled), and
//   (3) overlap by more than 0.02 x 0.02 units, and
//   (4) are (partly) EXPOSED - i.e. a sample of the overlap has no third cube sitting
//       within +-0.03 units of the plane, which would hide the seam inside the body.
// Rotated cubes are skipped: with non-90 degree rotations their faces are not parallel to an
// axis plane at all, so they cannot be exactly coplanar with one.  (Cubes that share a
// rotation value - a shard and its own tip - are parallel but sit at different offsets, which
// the "exact plane" grouping already separates.  tools/zfight.js prints the count it skipped.)
// The geometry guard in tools/slime_geometry.js nudges one cube of every such pair by
// <= 0.5 unit (1/32 block or less), and build_slime.js refuses to build while any remains.
// ==========================================================================================

const TOL = 1e-3;          // plane-coordinate match (units)
const MIN_OVERLAP = 0.02;  // ignore slivers thinner than this (units)
const SAMPLES = 5;         // probe grid per overlap
const PROBE = 0.03;        // how far off the plane a hider must reach (units)

function axisAligned(cube) {
  const r = cube.rotation || [0, 0, 0];
  return !r.some((v) => Math.abs(v) > 1e-9);
}

function analyse(model) {
  const all = model.cubes;
  const flat = all.filter(axisAligned);

  // axis -> plane coordinate -> [face record]
  const planes = { 0: new Map(), 1: new Map(), 2: new Map() };
  const put = (ax, coord, cube, face, rect) => {
    const k = Math.round(coord / TOL) * TOL;
    if (!planes[ax].has(k)) planes[ax].set(k, []);
    planes[ax].get(k).push({ cube, face, rect });
  };
  for (const c of flat) {
    const [x0, y0, z0] = c.from;
    const [x1, y1, z1] = c.to;
    put(0, x0, c, '-x', [y0, z0, y1, z1]);
    put(0, x1, c, '+x', [y0, z0, y1, z1]);
    put(1, y0, c, '-y', [x0, z0, x1, z1]);
    put(1, y1, c, '+y', [x0, z0, x1, z1]);
    put(2, z0, c, '-z', [x0, y0, x1, y1]);
    put(2, z1, c, '+z', [x0, y0, x1, y1]);
  }

  const inside = (c, p, eps) =>
    p[0] >= c.from[0] - eps && p[0] <= c.to[0] + eps &&
    p[1] >= c.from[1] - eps && p[1] <= c.to[1] + eps &&
    p[2] >= c.from[2] - eps && p[2] <= c.to[2] + eps;
  const overlap = (a, b) => {
    const u0 = Math.max(a[0], b[0]), v0 = Math.max(a[1], b[1]);
    const u1 = Math.min(a[2], b[2]), v1 = Math.min(a[3], b[3]);
    return (u1 - u0 > MIN_OVERLAP && v1 - v0 > MIN_OVERLAP) ? [u0, v0, u1, v1] : null;
  };

  const pairs = [];
  for (const ax of [0, 1, 2]) {
    for (const [coord, list] of planes[ax]) {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i], b = list[j];
          if (a.cube === b.cube) continue;              // two faces of one cube never fight
          if (a.face[0] !== b.face[0]) continue;        // opposite facing: one side is culled
          const o = overlap(a.rect, b.rect);
          if (!o) continue;
          let exposed = 0;
          for (let su = 0; su < SAMPLES; su++) {
            for (let sv = 0; sv < SAMPLES; sv++) {
              const u = o[0] + (o[2] - o[0]) * (su + 0.5) / SAMPLES;
              const v = o[1] + (o[3] - o[1]) * (sv + 0.5) / SAMPLES;
              const p = [0, 0, 0];
              p[ax] = coord;
              if (ax === 0) { p[1] = u; p[2] = v; } else if (ax === 1) { p[0] = u; p[2] = v; } else { p[0] = u; p[1] = v; }
              const out = p.slice(), inn = p.slice();
              out[ax] += PROBE; inn[ax] -= PROBE;
              const hidden = flat.some((c) => c !== a.cube && c !== b.cube && (inside(c, out, 0) || inside(c, inn, 0)));
              if (!hidden) exposed++;
            }
          }
          if (!exposed) continue;                        // fully buried: cannot be seen, cannot shimmer
          const area = Math.abs((o[2] - o[0]) * (o[3] - o[1]));
          pairs.push({
            axis: 'xyz'[ax], coord,
            a: a.cube.name, aBone: a.cube.bone, aFace: a.face,
            b: b.cube.name, bBone: b.cube.bone, bFace: b.face,
            overlap: o.map((v) => +v.toFixed(3)), area: +area.toFixed(3),
            exposedSamples: exposed, samples: SAMPLES * SAMPLES,
          });
        }
      }
    }
  }
  pairs.sort((x, y) => y.area - x.area);

  // Opposite-facing planes that sit only a hair apart shimmer too on a weak depth buffer.
  const thin = [];
  const seen = new Set();
  for (const ax of [0, 1, 2]) {
    for (const list of planes[ax].values()) {
      for (const a of list) {
        for (const b of list) {
          if (a.cube === b.cube || a.face[0] === b.face[0]) continue;
          if (!overlap(a.rect, b.rect)) continue;
          const da = a.face[0] === '+' ? a.cube.to[ax] : a.cube.from[ax];
          const db = b.face[0] === '+' ? b.cube.to[ax] : b.cube.from[ax];
          const gap = Math.abs(da - db);
          if (gap <= 1e-9 || gap >= 0.12) continue;
          const key = [a.cube.name, b.cube.name].sort().join('|') + '|' + gap.toFixed(4);
          if (seen.has(key)) continue;
          seen.add(key);
          thin.push({ axis: 'xyz'[ax], a: a.cube.name, b: b.cube.name, gap: +gap.toFixed(4) });
        }
      }
    }
  }
  thin.sort((x, y) => x.gap - y.gap);

  return {
    checkedCubes: flat.length,
    skippedRotatedCubes: all.length - flat.length,
    exposedPairs: pairs,
    thinGaps: thin,
    ok: pairs.length === 0 && thin.length === 0,
  };
}

module.exports = { analyse };
