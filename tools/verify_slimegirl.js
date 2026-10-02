'use strict';
// 史莱姆少女 / SLIME GIRL — independent verifier.  OWNER: verifier.
//   node tools/verify_slimegirl.js      (exit 0 = no FAIL)
// Re-reads the written artifacts (not the builders) and checks the contracts a GeckoLib / Bedrock
// consumer actually depends on: file shape, rig integrity, UV bounds and 1:1 face sizing, animation
// targets, rest-pose ground contact, and that both atlases carry real pixels.
const fs = require('fs');
const path = require('path');
const png = require('./lib/png.js');

const ROOT = path.resolve(__dirname, '..');
const ID = 'slime_girl';
const FACES = ['north', 'east', 'south', 'west', 'up', 'down'];
const results = [];
let failed = 0;
function check(group, name, ok, detail) {
  if (!ok) failed++;
  results.push({ group, name, status: ok ? 'PASS' : 'FAIL', detail: detail === undefined ? '' : String(detail) });
}
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

// ---------------------------------------------------------------- 1. files --
const files = [ID + '.geo.json', ID + '.animation.json', ID + '.bbmodel', ID + '.png', ID + '_glow.png'];
for (const f of files) check('files', f + ' exists', fs.existsSync(path.join(ROOT, f)), fs.existsSync(path.join(ROOT, f)) ? fs.statSync(path.join(ROOT, f)).size + ' bytes' : 'missing');
const geo = read(ID + '.geo.json');
const anim = read(ID + '.animation.json');
const bb = read(ID + '.bbmodel');
const report = read('build/slimegirl_report.json');

// ------------------------------------------------------------- 2. geometry --
const g = geo['minecraft:geometry'][0];
check('geometry', 'identifier is geometry.' + ID, g.description.identifier === 'geometry.' + ID, g.description.identifier);
check('geometry', 'format 1.12.0', geo.format_version === '1.12.0', geo.format_version);
check('geometry', 'texture resolution matches the atlas', g.description.texture_width === 128 && g.description.texture_height === 128, g.description.texture_width + 'x' + g.description.texture_height);
const names = new Set(g.bones.map((b) => b.name));
check('geometry', 'bone names unique', names.size === g.bones.length, g.bones.length + ' bones');
const badParent = g.bones.filter((b) => b.parent && !names.has(b.parent));
check('geometry', 'every parent bone exists', badParent.length === 0, badParent.map((b) => b.name).join(', '));
const cubeNames = [];
let cubes = 0, faces = 0;
for (const b of g.bones) for (const c of b.cubes || []) { cubes++; cubeNames.push(b.name + '/' + (c.origin.join(','))); for (const f of FACES) if (c.uv && c.uv[f]) faces++; }
check('geometry', 'cube count matches the build report', cubes === report.counts.cubes, cubes + ' vs ' + report.counts.cubes);
check('geometry', 'mesh has faces', faces > 400, faces + ' textured faces');

// ------------------------------------------------------------------ 3. UV --
let outOfBounds = 0, mismatched = 0, worst = 0, sizeChecked = 0;
for (const b of g.bones) for (const c of b.cubes || []) {
  const size = c.size;
  for (const f of FACES) {
    const uv = c.uv && c.uv[f];
    if (!uv) continue;
    const u = uv.uv, s = uv.uv_size;
    if (u[0] < 0 || u[1] < 0 || u[0] + s[0] > 128 || u[1] + s[1] > 128) outOfBounds++;
    const want = f === 'north' || f === 'south' ? [size[0], size[1]]
      : f === 'east' || f === 'west' ? [size[2], size[1]] : [size[0], size[2]];
    // Bedrock exports a 'down' face with a negative uv_size height (verified convention); compare
    // magnitudes so the check tests the projection size rather than the sign.
    const d = Math.max(Math.abs(Math.abs(s[0]) - want[0]), Math.abs(Math.abs(s[1]) - want[1]));
    sizeChecked++;
    if (d > worst) worst = d;
    if (d > 0.51) mismatched++;
  }
}
check('uv', 'every face UV stays inside the 128x128 atlas', outOfBounds === 0, outOfBounds + ' out of bounds');
check('uv', 'face UV size matches the face size (1 texel = 1 unit)', mismatched === 0, sizeChecked + ' faces, worst delta ' + worst.toFixed(2));

// ----------------------------------------------------------- 4. animations --
const clips = Object.entries(anim.animations);
check('animations', 'format 1.8.0', anim.format_version === '1.8.0', anim.format_version);
check('animations', 'seven clips', clips.length === 7, clips.map(([k]) => k.split('.').pop()).join(', '));
const needed = ['idle', 'move', 'attack', 'skill', 'spawn', 'death', 'sit'];
for (const n of needed) check('animations', 'clip ' + n + ' exists', clips.some(([k]) => k.endsWith('.' + n)), '');
let badTargets = [], shortClips = [], keyTotal = 0;
for (const [key, clip] of clips) {
  if (!(clip.animation_length > 0)) shortClips.push(key);
  for (const [bone, chans] of Object.entries(clip.bones || {})) {
    if (!names.has(bone)) badTargets.push(key + ':' + bone);
    for (const ch of Object.values(chans)) {
      const n = Object.keys(ch).length;
      keyTotal += n;
      if (n < 2) badTargets.push(key + ':' + bone + '(keys)');
    }
  }
}
check('animations', 'every animated bone exists in the rig', badTargets.length === 0, badTargets.slice(0, 6).join(', '));
check('animations', 'every clip has a positive length', shortClips.length === 0, shortClips.join(', '));
check('animations', 'clips carry real motion', keyTotal > 1200, keyTotal + ' keyframes');

// ----------------------------------------------------------- 5. rest pose --
let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity;
for (const b of g.bones) for (const c of b.cubes || []) {
  minY = Math.min(minY, c.origin[1]); maxY = Math.max(maxY, c.origin[1] + c.size[1]);
  minX = Math.min(minX, c.origin[0]); maxX = Math.max(maxX, c.origin[0] + c.size[0]);
}
check('rest pose', 'feet stand on y = 0', Math.abs(minY) < 0.001, 'min y = ' + minY);
check('rest pose', 'total height is a player-scale 2-3 blocks', maxY > 32 && maxY < 48, 'height ' + maxY + ' units = ' + (maxY / 16).toFixed(2) + ' blocks');
check('rest pose', 'roughly symmetric about x = 0', Math.abs(minX + maxX) < 2, 'x ' + minX + '..' + maxX);

// ------------------------------------------------------------- 6. texture --
const base = png.decode(fs.readFileSync(path.join(ROOT, ID + '.png')));
const glow = png.decode(fs.readFileSync(path.join(ROOT, ID + '_glow.png')));
check('texture', 'base atlas is 128x128 RGBA', base.width === 128 && base.height === 128, base.width + 'x' + base.height);
check('texture', 'glow atlas matches the base resolution', glow.width === base.width && glow.height === base.height, glow.width + 'x' + glow.height);
function stats(img) {
  let opaque = 0, emissive = 0, colors = new Set();
  for (let i = 0; i < img.width * img.height; i++) {
    const o = i * 4;
    if (img.pixels[o + 3] > 0) { opaque++; colors.add(img.pixels[o] + ',' + img.pixels[o + 1] + ',' + img.pixels[o + 2]); }
    if (img.pixels[o + 3] > 32) emissive++;
  }
  return { opaque, emissive, colors: colors.size };
}
const bs = stats(base), gs = stats(glow);
check('texture', 'base atlas is fully painted', bs.opaque === 128 * 128, bs.opaque + ' opaque texels');
check('texture', 'base atlas uses a real palette', bs.colors > 60, bs.colors + ' distinct colours');
check('texture', 'glow atlas is spare, not a copy', gs.emissive > 0 && gs.emissive < 400, gs.emissive + ' emissive texels');

// ---------------------------------------------------------------- 7. flicker --
check('flicker', 'build refused coplanar faces', report.flicker.exposedCoplanarPairs === 0 && report.flicker.thinGaps === 0, 'pairs ' + report.flicker.exposedCoplanarPairs + ', thin gaps ' + report.flicker.thinGaps);
check('flicker', 'geometry audit covered every cube', report.flicker.checkedCubes === cubes, report.flicker.checkedCubes + '/' + cubes);

// --------------------------------------------------------------- 8. report --
const groups = {};
for (const r of results) groups[r.group] = (groups[r.group] || 0) + (r.status === 'FAIL' ? 1 : 0);
console.log('');
console.log('================ slime_girl verification ================');
for (const [group, bad] of Object.entries(groups)) console.log('  ' + (bad ? 'FAIL' : 'PASS').padEnd(5) + ' ' + group);
console.log('  ' + results.length + ' checks, ' + failed + ' failed');
for (const r of results.filter((r) => r.status === 'FAIL')) console.log('    FAIL ' + r.group + ' / ' + r.name + (r.detail ? '  [' + r.detail + ']' : ''));
fs.writeFileSync(path.join(ROOT, 'build', 'slimegirl_verify.json'), JSON.stringify({ checks: results, failed }, null, 2) + '\n');
process.exit(failed ? 1 : 0);