const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const root = __dirname;
const outDir = root;
const W = 128;
const H = 128;
const pixels = Buffer.alloc(W * H * 4, 0);

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
function color(hex, a = 255) {
  const value = hex.replace('#', '');
  return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16), a];
}
function setPixel(x, y, rgba) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  pixels[i] = rgba[0]; pixels[i + 1] = rgba[1]; pixels[i + 2] = rgba[2]; pixels[i + 3] = rgba[3];
}
function getPixel(x, y) {
  if (x < 0 || y < 0 || x >= W || y >= H) return [0, 0, 0, 0];
  const i = (y * W + x) * 4;
  return [pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]];
}
function rect(x, y, w, h, fill) {
  const c = Array.isArray(fill) ? fill : color(fill);
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) setPixel(xx, yy, c);
}
function line(x1, y1, x2, y2, fill) {
  const c = Array.isArray(fill) ? fill : color(fill);
  let dx = Math.abs(x2 - x1), sx = x1 < x2 ? 1 : -1;
  let dy = -Math.abs(y2 - y1), sy = y1 < y2 ? 1 : -1;
  let err = dx + dy;
  while (true) {
    setPixel(x1, y1, c);
    if (x1 === x2 && y1 === y2) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x1 += sx; }
    if (e2 <= dx) { err += dx; y1 += sy; }
  }
}
function polygon(points, fill) {
  const c = Array.isArray(fill) ? fill : color(fill);
  const minY = Math.max(0, Math.floor(Math.min(...points.map(p => p[1]))));
  const maxY = Math.min(H - 1, Math.ceil(Math.max(...points.map(p => p[1]))));
  for (let y = minY; y <= maxY; y++) {
    const xs = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length];
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
        xs.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
      }
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      for (let x = Math.ceil(xs[i]); x <= Math.floor(xs[i + 1]); x++) setPixel(x, y, c);
    }
  }
}
function blend(x, y, rgba, amount) {
  const old = getPixel(x, y);
  const a = clamp(amount, 0, 1);
  setPixel(x, y, [
    Math.round(old[0] * (1 - a) + rgba[0] * a),
    Math.round(old[1] * (1 - a) + rgba[1] * a),
    Math.round(old[2] * (1 - a) + rgba[2] * a),
    Math.max(old[3], rgba[3])
  ]);
}
function crc32(buf) {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const t = Buffer.from(type);
  const body = Buffer.concat([t, data]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc32(body), 0);
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  return Buffer.concat([len, body, c]);
}
function makePng() {
  const scan = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) {
    scan[y * (W * 4 + 1)] = 0;
    pixels.copy(scan, y * (W * 4 + 1) + 1, y * W * 4, (y + 1) * W * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(scan, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// Texture atlas: body and liquid blocks are kept separate for fast editing in Blockbench.
for (let y = 0; y < 48; y++) {
  const t = y / 47;
  const r = Math.round(103 * (1 - t) + 39 * t);
  const g = Math.round(145 * (1 - t) + 67 * t);
  const b = Math.round(48 * (1 - t) + 25 * t);
  rect(0, y, 64, 1, [r, g, b, 255]);
}
for (let y = 0; y < 48; y++) {
  const t = y / 47;
  rect(64, y, 64, 1, [Math.round(18 - 7 * t), Math.round(20 - 9 * t), Math.round(27 - 4 * t), 255]);
}
// Pixel noise keeps the exposed slime from reading as a flat color.
let seed = 41873;
for (let i = 0; i < 180; i++) {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  const x = seed % 64;
  seed = (seed * 1664525 + 1013904223) >>> 0;
  const y = seed % 48;
  const shades = ['#86a83a', '#557d27', '#29491f', '#b5c94b'];
  blend(x, y, color(shades[i % shades.length]), i % 3 === 0 ? 0.7 : 0.45);
}
// Black ooze patches and vertical drips on the body atlas.
polygon([[5, 0], [20, 0], [19, 8], [16, 10], [15, 22], [11, 23], [10, 8], [6, 7]], '#0d1017');
polygon([[30, 0], [47, 0], [47, 12], [44, 13], [43, 28], [38, 30], [37, 10], [31, 8]], '#12131a');
polygon([[51, 0], [63, 0], [63, 18], [59, 18], [58, 36], [54, 37], [53, 10]], '#080b10');
rect(0, 35, 64, 13, '#1b241e');
polygon([[2, 35], [14, 35], [14, 41], [11, 42], [10, 48], [4, 48]], '#080b10');
polygon([[22, 32], [35, 31], [34, 40], [31, 41], [30, 48], [23, 48]], '#0b0d12');
polygon([[44, 33], [59, 33], [59, 44], [56, 45], [55, 48], [47, 48]], '#090c12');
// Liquid atlas: violet-black body, green reflected edge, and wet specular marks.
for (let y = 0; y < 48; y += 4) {
  line(64, y, 127, y, y % 8 === 0 ? '#252331' : '#11131a');
}
polygon([[67, 1], [83, 1], [82, 14], [78, 17], [77, 31], [72, 32], [72, 13], [68, 10]], '#05070b');
polygon([[92, 0], [109, 0], [108, 20], [104, 21], [103, 40], [98, 42], [97, 16], [93, 14]], '#080910');
polygon([[116, 2], [126, 2], [126, 29], [122, 30], [121, 47], [116, 47]], '#06070c');
line(70, 4, 77, 3, '#566b49'); line(96, 5, 103, 4, '#5d6551'); line(119, 8, 124, 7, '#7f8059');
line(75, 21, 77, 22, '#3b4f39'); line(102, 24, 105, 23, '#4c5a40'); line(119, 37, 121, 35, '#394932');
for (let i = 0; i < 36; i++) {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  const x = 64 + (seed % 64);
  seed = (seed * 1664525 + 1013904223) >>> 0;
  const y = seed % 48;
  blend(x, y, color(i % 2 ? '#343344' : '#0a0b12'), 0.55);
}
// Face region: black sockets with acid-green/cyan eyes.
rect(0, 64, 32, 16, '#080a0e');
rect(2, 66, 12, 10, '#c5d85c'); rect(18, 66, 12, 10, '#c5d85c');
rect(4, 68, 8, 6, '#71d5bd'); rect(20, 68, 8, 6, '#71d5bd');
rect(5, 68, 3, 3, '#e9ff9a'); rect(21, 68, 3, 3, '#e9ff9a');
rect(10, 72, 2, 2, '#14251d'); rect(26, 72, 2, 2, '#14251d');
// Detail region for optional extra pieces.
rect(32, 64, 64, 32, '#0b0d12');
polygon([[35, 65], [44, 65], [43, 79], [40, 81], [39, 94], [35, 94]], '#20232d');
polygon([[52, 66], [62, 66], [61, 82], [58, 84], [57, 95], [52, 95]], '#161923');
polygon([[69, 65], [80, 65], [79, 76], [75, 78], [74, 94], [69, 94]], '#27283a');
line(36, 66, 42, 67, '#667a54'); line(53, 68, 60, 69, '#586a4a'); line(70, 67, 77, 68, '#79815b');
rect(84, 66, 9, 9, '#71d5bd'); rect(86, 68, 5, 5, '#d7f47a');

const png = makePng();
fs.writeFileSync(path.join(outDir, 'black_ooze_slime.png'), png);

let uuidCounter = 0;
function uuid() {
  uuidCounter++;
  const n = uuidCounter.toString(16).padStart(12, '0');
  return `9b3f7a12-2a5d-4c0e-8${n.slice(0, 3)}-${n.slice(3).padEnd(12, '0')}`;
}
function uvFaces(u, v, w, h, d) {
  return {
    north: { uv: [u, v, u + w, v + h], texture: 0 },
    east: { uv: [u + w, v, u + w + d, v + h], texture: 0 },
    south: { uv: [u + w + d, v, u + 2 * w + d, v + h], texture: 0 },
    west: { uv: [u + 2 * w + d, v, u + 2 * w + 2 * d, v + h], texture: 0 },
    up: { uv: [u + w, v + h, u, v + h + d], texture: 0 },
    down: { uv: [u + w, v + h + d, u, v + h + 2 * d], texture: 0 }
  };
}
function cube(name, from, to, uv, origin, rotation = [0, 0, 0], colorIndex = 0) {
  const size = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  return {
    name, box_uv: false, render_order: 'default', locked: false, export: true, scope: 0,
    allow_mirror_modeling: true, from, to, autouv: 0, color: colorIndex,
    rotation, origin: origin || [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2],
    faces: uvFaces(uv[0], uv[1], Math.abs(size[0]), Math.abs(size[1]), Math.abs(size[2])),
    type: 'cube', uuid: uuid()
  };
}
const elements = [];
const groups = [];
const groupChildren = new Map();
function group(name, origin, rotation, colorIndex, parent = null) {
  const g = { name, uuid: uuid(), export: true, locked: false, scope: 0, selected: false, visibility: true,
    _static: { properties: {}, temp_data: {} }, origin, rotation, bedrock_binding: '', color: colorIndex,
    children: [], reset: false, shade: true, mirror_uv: false, autouv: 0, isOpen: false, primary_selected: false };
  groups.push(g); groupChildren.set(g.uuid, g.children); if (parent) groupChildren.get(parent).push(g.uuid); return g.uuid;
}
function addCube(groupId, c) { elements.push(c); groupChildren.get(groupId).push(c.uuid); return c; }
const rootGroup = group('all', [0, 0, 0], [0, 0, 0], 0);
const bodyGroup = group('ooze_body', [0, 4, 0], [0, 0, 0], 1, rootGroup);
addCube(bodyGroup, cube('body_main', [-8, 4, -7], [8, 20, 7], [0, 0], [0, 12, 0], [0, 0, 0], 1));
addCube(bodyGroup, cube('body_cap', [-6, 18, -5], [6, 24, 5], [0, 24], [0, 18, 0], [0, 0, 3], 2));
addCube(bodyGroup, cube('belly_ooze', [-6, 4, -7.5], [6, 9, -6.3], [64, 0], [0, 7, -7], [0, 0, 0], 3));
addCube(bodyGroup, cube('back_ooze', [-5, 8, 6.3], [5, 17, 7.4], [64, 20], [0, 12, 7], [0, 0, 0], 4));
const eyeGroup = group('acid_eyes', [0, 12, -7], [0, 0, 0], 3, rootGroup);
addCube(eyeGroup, cube('eye_left', [-5, 11, -7.6], [-1, 15, -7], [0, 64], [-3, 13, -7.4], [0, 0, 0], 5));
addCube(eyeGroup, cube('eye_right', [1, 11, -7.6], [5, 15, -7], [0, 64], [3, 13, -7.4], [0, 0, 0], 5));
addCube(eyeGroup, cube('mouth_slit', [-3, 8, -7.7], [3, 10, -7], [32, 64], [0, 9, -7.4], [0, 0, 0], 6));
const dripGroup = group('black_liquid_drips', [0, 0, 0], [0, 0, 0], 4, rootGroup);
addCube(dripGroup, cube('drip_front_center', [-2, 1, -8], [2, 10, -7], [64, 0], [0, 9, -7.5], [0, 0, 0], 7));
addCube(dripGroup, cube('drip_front_left', [-7, 7, -8], [-5, 14, -7], [64, 0], [-6, 12, -7.5], [0, 0, 0], 7));
addCube(dripGroup, cube('drip_front_right', [5, 6, -8], [7, 13, -7], [64, 0], [6, 11, -7.5], [0, 0, 0], 7));
const rightArm = group('right_ooze_tendril', [8, 13, 0], [0, 0, -12], 5, dripGroup);
addCube(rightArm, cube('right_tendril_upper', [7, 10, -3], [12, 15, 3], [64, 0], [8, 13, 0], [0, 0, -12], 8));
addCube(rightArm, cube('right_tendril_mid', [10, 4, -2], [14, 11, 2], [64, 20], [12, 10, 0], [0, 0, -18], 8));
addCube(rightArm, cube('right_tendril_tip', [12, 0, -1.5], [15, 6, 1.5], [64, 20], [14, 5, 0], [0, 0, -12], 8));
const leftArm = group('left_ooze_tendril', [-8, 13, 0], [0, 0, 12], 6, dripGroup);
addCube(leftArm, cube('left_tendril_upper', [-12, 10, -3], [-7, 15, 3], [64, 0], [-8, 13, 0], [0, 0, 12], 8));
addCube(leftArm, cube('left_tendril_mid', [-14, 4, -2], [-10, 11, 2], [64, 20], [-12, 10, 0], [0, 0, 18], 8));
addCube(leftArm, cube('left_tendril_tip', [-15, 0, -1.5], [-12, 6, 1.5], [64, 20], [-14, 5, 0], [0, 0, 12], 8));
const rearGroup = group('rear_drag', [0, 8, 7], [0, 0, 0], 7, dripGroup);
addCube(rearGroup, cube('rear_drip_upper', [-3, 8, 7], [3, 14, 10], [64, 0], [0, 13, 8], [10, 0, 0], 8));
addCube(rearGroup, cube('rear_drip_tip', [-2, 1, 8], [2, 9, 11], [64, 20], [0, 8, 9], [8, 0, 0], 8));
const topGroup = group('crown_ooze', [0, 22, 0], [0, 0, 0], 8, rootGroup);
addCube(topGroup, cube('crown_blob', [-3, 21, -3], [3, 26, 3], [64, 0], [0, 22, 0], [0, 0, 0], 9));
addCube(topGroup, cube('crown_drip', [-1.5, 23, -4], [1.5, 29, -2.5], [64, 20], [0, 24, -3], [0, 0, 0], 9));

const outliner = [{ uuid: rootGroup, isOpen: true, children: groupChildren.get(rootGroup) }];
const textureBase64 = png.toString('base64');
const texture = {
  name: 'black_ooze_slime.png', relative_path: 'black_ooze_slime.png', folder: '', namespace: '', id: '0', group: '', scope: 0,
  width: W, height: H, uv_width: W, uv_height: H, particle: false, use_as_default: true, layers_enabled: false,
  sync_to_project: '', file_format: 'png', render_mode: 'default', render_sides: 'auto', wrap_mode: 'limited', pbr_channel: 'color',
  fps: 1, frame_time: 1, frame_order_type: 'loop', frame_order: '', frame_interpolate: false, visible: true, internal: true,
  saved: true, uuid: uuid(), source: `data:image/png;base64,${textureBase64}`
};
const bbmodel = {
  meta: { format_version: '5.0', model_format: 'bedrock', box_uv: false },
  name: 'black_ooze_slime.geo', model_identifier: 'geometry.black_ooze_slime', visible_box: [5, 4, 2],
  variable_placeholders: '', multi_file_ruleset: '', variable_placeholder_buttons: [], bedrock_animation_mode: 'entity', timeline_setups: [], unhandled_root_fields: {},
  resolution: { width: W, height: H }, elements, groups, outliner, textures: [texture]
};
fs.writeFileSync(path.join(outDir, 'black_ooze_slime.bbmodel'), JSON.stringify(bbmodel, null, 2));

function bedrockCube(e) {
  const from = e.from; const size = [e.to[0] - from[0], e.to[1] - from[1], e.to[2] - from[2]];
  const b = { origin: from, size, uv: {} };
  for (const [face, f] of Object.entries(e.faces)) b.uv[face] = { uv: [f.uv[0], f.uv[1]], uv_size: [f.uv[2] - f.uv[0], f.uv[3] - f.uv[1]] };
  if (e.rotation.some(v => v !== 0)) { b.pivot = e.origin; b.rotation = e.rotation; }
  return b;
}
const groupById = new Map(groups.map(g => [g.uuid, g]));
function bone(id, parent = null) {
  const g = groupById.get(id);
  const b = { name: g.name };
  if (parent) b.parent = groupById.get(parent).name;
  b.pivot = g.origin;
  if (g.rotation.some(v => v !== 0)) b.rotation = g.rotation;
  const childIds = groupChildren.get(id) || [];
  const cubes = childIds.filter(child => elements.some(e => e.uuid === child)).map(child => bedrockCube(elements.find(e => e.uuid === child)));
  if (cubes.length) b.cubes = cubes;
  return b;
}
const parentMap = new Map();
for (const g of groups) for (const parent of groups) if ((groupChildren.get(parent.uuid) || []).includes(g.uuid)) parentMap.set(g.uuid, parent.uuid);
const bones = groups.map(g => bone(g.uuid, parentMap.get(g.uuid)));
const geo = {
  format_version: '1.12.0',
  'minecraft:geometry': [{
    description: { identifier: 'geometry.black_ooze_slime', texture_width: W, texture_height: H, visible_bounds_width: 5, visible_bounds_height: 4.5, visible_bounds_offset: [0, 2.25, 0] },
    bones
  }]
};
fs.writeFileSync(path.join(outDir, 'black_ooze_slime.geo.json'), JSON.stringify(geo, null, 2));

const readme = `# Black Ooze Slime\n\nA Blockbench-ready Minecraft Bedrock creature model based on the supplied segmented tentacle references.\n\n## Files\n\n- **black_ooze_slime.bbmodel**: editable Blockbench project with embedded texture.\n- **black_ooze_slime.geo.json**: Bedrock geometry export using geometry.black_ooze_slime.\n- **black_ooze_slime.png**: 128x128 pixel texture atlas.\n\n## Design\n\nThe creature is a low-poly slime with exposed moss-green gel under a coat of black, purple-reflective ooze. Three face drips, two asymmetrical side tendrils, a rear drag, and a crown drip give it a wet, unstable silhouette. Acid-green/cyan eyes provide the only bright focal point.\n\nOpen the .bbmodel in Blockbench and keep black_ooze_slime.png next to it when exporting to a resource pack.\n`;
fs.writeFileSync(path.join(outDir, 'README.md'), readme);
console.log(`Generated ${elements.length} cubes, ${groups.length} bones, ${W}x${H} texture.`);
