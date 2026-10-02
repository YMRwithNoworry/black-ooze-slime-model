'use strict';
// ACID GEL SLIME — build entry point.  OWNER: lead.
//   node build_slime.js
// Produces: acid_gel_slime.bbmodel / .geo.json / .animation.json / .png / _glow.png
//           build/report.json  (machine-readable build report for the verifier)
const fs = require('fs');
const path = require('path');
const png = require('./tools/lib/png.js');
const { Model, AnimationSet, writeJSON } = require('./tools/lib/model.js');
const { Canvas, rgb, shade, TileView, PALETTE, prng, withAlpha } = require('./tools/lib/canvas.js');
const ID = 'acid_gel_slime';
const RES = 128;

const atlas = require('./tools/slime_atlas.js').build();
const model = new Model({
  identifier: ID, projectName: ID + '.geo',
  resolution: { width: RES, height: RES },
  visibleBox: [2.5, 2.5, 2.5], visibleOffset: [0, 1, 0],
});

const geometry = require('./tools/slime_geometry.js')({ model, atlas, tiles: atlas.tiles });
const texture = require('./tools/slime_texture.js')({
  atlas, res: RES, C: { Canvas, TileView, rgb, shade, withAlpha, PALETTE, prng },
  view: null,
});
const anim = new AnimationSet(ID);
const animations = require('./tools/slime_animations.js')({
  anim, bones: model.bones.map(b => b.name),
  pivots: Object.fromEntries(model.bones.map(b => [b.name, b.pivot])),
  rigHeight: model.bounds() ? model.bounds().size[1] : 20,
});

// ---- texture-flicker guard: two faces on the same plane make the surface shimmer, so the
//      build refuses to write artifacts while any exposed coplanar pair is left in the rig.
//      tools/lib/zfight.js is the audit; tools/zfight.js prints the same report from the CLI.
const flicker = require('./tools/lib/zfight.js').analyse(model);
if (!flicker.ok) {
  const list = flicker.exposedPairs.slice(0, 8)
    .map(p => '  ' + p.axis + '=' + p.coord + '  ' + p.a + ' (' + p.aFace + ') vs ' + p.b + ' (' + p.bFace + ')  area ' + p.area).join('\n');
  throw new Error('texture-flicker guard: ' + flicker.exposedPairs.length + ' exposed coplanar face pair(s), ' +
    flicker.thinGaps.length + ' thin gap(s)\n' + list +
    '\n(tools/slime_geometry.js carries the de-coplanar nudges - run node tools/zfight.js for the full list)');
}

// ---- write files
const basePng = png.encode(RES, RES, texture.base);
const glowPng = png.encode(RES, RES, texture.glow);
fs.writeFileSync(ID + '.png', basePng);
fs.writeFileSync(ID + '_glow.png', glowPng);

const bb = model.toBBModel({ textures: [{ name: ID + '.png', png: basePng }, { name: ID + '_glow.png', png: glowPng }] });
bb.animations = anim.toBBModelAnimations(name => model.boneRef(name).uuid);
writeJSON(ID + '.bbmodel', bb);
writeJSON(ID + '.geo.json', model.toGeoJSON());
writeJSON(ID + '.animation.json', anim.toJSON());

// ---- report
const bounds = model.bounds();
const bbox = (() => {
  const map = new Map();
  for (const t of atlas.list) {
    for (let y = t.y; y < t.y + t.h; y++) for (let x = t.x; x < t.x + t.w; x++) map.set(y * RES + x, t.name);
  }
  return map;
})();
const report = {
  identifier: ID,
  built: new Date().toISOString(),
  resolution: RES,
  counts: { bones: model.bones.length, cubes: model.cubes.length, tiles: atlas.list.length, animations: anim.clips.length, clips: anim.clips.map(c => c.name) },
  bounds,
  bones: model.bones.map(b => ({ name: b.name, parent: b.parent, pivot: b.pivot, rotation: b.rotation, cubes: b.cubes.length })),
  cubes: model.cubes.map(c => ({ name: c.name, bone: c.bone, from: c.from, to: c.to, inflate: c.inflate, faces: Object.fromEntries(Object.entries(c.faces).filter(([, v]) => v).map(([k, v]) => [k, v.rect])) })),
  tiles: atlas.list.map(t => ({ name: t.name, family: t.family, rect: t.rect, params: t.params })),
  texturedPixels: bbox.size,
  flicker: {
    status: 'clean',
    checkedCubes: flicker.checkedCubes,
    skippedRotatedCubes: flicker.skippedRotatedCubes,
    exposedCoplanarPairs: flicker.exposedPairs.length,
    thinGaps: flicker.thinGaps.length,
    note: 'coplanar + same-facing + exposed overlaps only; the geometry guard nudges one cube of every pair by <=0.5 unit',
  },
  modelWarnings: model.warnings,
  atlasWarnings: atlas.warnings,
  geometryNotes: geometry.notes,
  textureNotes: texture.notes,
};
fs.mkdirSync('build', { recursive: true });
writeJSON(path.join('build', 'report.json'), report);

console.log(`built ${ID}: ${report.counts.bones} bones / ${report.counts.cubes} cubes / ${report.counts.tiles} tiles / ${report.counts.animations} clips`);
console.log(`bounds ${bounds.size.map(v => v.toFixed(1)).join(' x ')} (x y z), atlas ${RES}x${RES} (${(100 * bbox.size / (RES * RES)).toFixed(1)}% claimed)`);
console.log('flicker: clean - 0 exposed coplanar face pairs (' + flicker.checkedCubes + ' axis-aligned cubes audited, ' + flicker.skippedRotatedCubes + ' rotated skipped)');
console.log(`warnings: model ${model.warnings.length}, atlas ${atlas.warnings.length}  -> build/report.json`);
