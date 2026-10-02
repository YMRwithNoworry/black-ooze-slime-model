'use strict';
// ==========================================================================================
// node tools/zfight.js  -  texture-flicker / z-fighting report for the current rig
// ------------------------------------------------------------------------------------------
// Prints every pair of coplanar, same-facing cube faces whose overlap is exposed, i.e. every
// surface patch that shimmers.  Exits 1 if any remains, so it doubles as a check.  The audit
// itself lives in tools/lib/zfight.js and is also run by build_slime.js (which refuses to
// write artifacts while a pair is left).
// ==========================================================================================
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { Model } = require(path.join(ROOT, 'tools/lib/model.js'));
const atlas = require(path.join(ROOT, 'tools/slime_atlas.js')).build();
const { analyse } = require(path.join(ROOT, 'tools/lib/zfight.js'));

const model = new Model({ identifier: 'acid_gel_slime', resolution: { width: 128, height: 128 } });
require(path.join(ROOT, 'tools/slime_geometry.js'))({ model, atlas, tiles: atlas.tiles });

const r = analyse(model);
console.log('coplanar, same-facing, EXPOSED overlapping face pairs (these flicker): ' + r.exposedPairs.length);
for (const p of r.exposedPairs.slice(0, 30)) {
  console.log('  ' + p.axis + '=' + (+p.coord.toFixed(3)) + '  ' + p.a + ' (' + p.aFace + ')  vs  ' + p.b +
    ' (' + p.bFace + ')   overlap area ' + p.area + '   exposed samples ' + p.exposedSamples + '/' + p.samples);
}
if (!r.exposedPairs.length) console.log('  (none - every coplanar overlap is buried inside the body)');
console.log('');
console.log('thin parallel gaps (<0.12 units, opposite facing) that can shimmer: ' + r.thinGaps.length);
for (const t of r.thinGaps.slice(0, 20)) console.log('  ' + t.axis + '  ' + t.a + ' <-> ' + t.b + '   gap ' + t.gap);
console.log('');
console.log('audited ' + r.checkedCubes + ' axis-aligned cubes, skipped ' + r.skippedRotatedCubes + ' rotated ones');
console.log(r.ok ? 'FLICKER AUDIT: CLEAN' : 'FLICKER AUDIT: ' + (r.exposedPairs.length + r.thinGaps.length) + ' FINDING(S)');
process.exit(r.ok ? 0 : 1);
