'use strict';
// 史莱姆少女 / SLIME GIRL — build entry point.  OWNER: lead.
//   node build_slimegirl.js
// Produces: slime_girl.bbmodel / .geo.json / .animation.json / .png / _glow.png
//           build/slimegirl_report.json, build/slimegirl_atlas.json
const fs = require('fs');
const path = require('path');
const png = require('./tools/lib/png.js');
const { Model, AnimationSet, writeJSON } = require('./tools/lib/model.js');
const ID = 'slime_girl';
const RES = 128;

const atlas = require('./tools/sg_atlas.js').build(RES);
const model = new Model({
  identifier: ID, projectName: ID + '.geo',
  resolution: { width: RES, height: RES },
  visibleBox: [6, 6, 6], visibleOffset: [0, 17, 0],
});

const geometry = require('./tools/sg_geometry.js')({ model, atlas, tiles: atlas.tiles });
const texture = require('./tools/sg_texture.js')({ atlas, res: RES });
const anim = new AnimationSet(ID);
const animations = require('./tools/sg_animations.js')({
  anim, bones: model.bones.map((b) => b.name),
  pivots: Object.fromEntries(model.bones.map((b) => [b.name, b.pivot])),
  rigHeight: model.bounds() ? model.bounds().size[1] : 34,
});

// ---- texture-flicker guard: two faces on the same plane shimmer, so the build refuses to
//      write artifacts while any exposed coplanar pair is left in the rig.
const flicker = require('./tools/lib/zfight.js').analyse(model);
if (!flicker.ok) {
  const list = flicker.exposedPairs.slice(0, 8)
    .map((p) => '  ' + p.axis + '=' + p.coord + '  ' + p.a + ' (' + p.aFace + ') vs ' + p.b + ' (' + p.bFace + ')  area ' + p.area).join('\n');
  throw new Error('texture-flicker guard: ' + flicker.exposedPairs.length + ' exposed coplanar face pair(s), ' +
    flicker.thinGaps.length + ' thin gap(s)\n' + list);
}

// ---- write files
const basePng = png.encode(RES, RES, texture.base);
const glowPng = png.encode(RES, RES, texture.glow);
fs.writeFileSync(ID + '.png', basePng);
fs.writeFileSync(ID + '_glow.png', glowPng);

const bb = model.toBBModel({ textures: [{ name: ID + '.png', png: basePng }, { name: ID + '_glow.png', png: glowPng }] });
bb.animations = anim.toBBModelAnimations((name) => model.boneRef(name).uuid);
writeJSON(ID + '.bbmodel', bb);
writeJSON(ID + '.geo.json', model.toGeoJSON());
writeJSON(ID + '.animation.json', anim.toJSON());

// ---- reports
const bounds = model.bounds();
const coverage = atlas.atlas.coverage();
const report = {
  identifier: ID,
  built: new Date().toISOString(),
  resolution: RES,
  counts: {
    bones: model.bones.length, cubes: model.cubes.length, tiles: atlas.list.length,
    animations: anim.clips.length, clips: anim.clips.map((c) => c.name),
    texturedPixels: coverage.size,
  },
  bounds: bounds,
  bones: model.bones.map((b) => ({ name: b.name, parent: b.parent, pivot: b.pivot, cubes: b.cubes.length })),
  cubes: model.cubes.map((c) => ({
    name: c.name, bone: c.bone, from: c.from, to: c.to, size: c.size,
    faces: Object.fromEntries(Object.entries(c.faces).filter(([, v]) => v).map(([k, v]) => [k, v.rect])),
  })),
  tiles: atlas.list.map((t) => ({ name: t.name, family: t.family, rect: t.rect, params: t.params })),
  flicker: {
    status: 'clean',
    checkedCubes: flicker.checkedCubes,
    skippedRotatedCubes: flicker.skippedRotatedCubes,
    exposedCoplanarPairs: flicker.exposedPairs.length,
    thinGaps: flicker.thinGaps.length,
  },
  modelWarnings: model.warnings,
  atlasWarnings: atlas.warnings,
  geometryNotes: geometry.notes,
  textureNotes: texture.notes,
  animationNotes: animations.notes,
};
fs.mkdirSync('build', { recursive: true });
writeJSON(path.join('build', 'slimegirl_report.json'), report);
writeJSON(path.join('build', 'slimegirl_atlas.json'), atlas.atlas.toJSON());

console.log('built ' + ID + ': ' + report.counts.bones + ' bones / ' + report.counts.cubes +
  ' cubes / ' + report.counts.tiles + ' tiles / ' + report.counts.animations + ' clips');
console.log('bounds ' + bounds.size.map((v) => v.toFixed(1)).join(' x ') + ' (x y z), atlas ' + RES + 'x' + RES +
  ' (' + (100 * coverage.size / (RES * RES)).toFixed(1) + '% claimed)');
console.log('flicker: clean - 0 exposed coplanar face pairs (' + flicker.checkedCubes +
  ' axis-aligned cubes audited, ' + flicker.skippedRotatedCubes + ' rotated skipped)');
console.log('warnings: model ' + model.warnings.length + ', atlas ' + atlas.warnings.length);
