'use strict';
// Model rig builder + .bbmodel / .geo.json / .animation.json writers.
// UV/face conventions verified against real Blockbench output (see tools/lib/atlas.js header).
const fs = require('fs');
const crypto = require('crypto');
const { bbFaceUV, geoFaceUV, FACES } = require('./atlas.js');

// Tile families that live on the second (emissive) texture.
const GLOW_FAMILIES = new Set(['eye_glow', 'eye_spark', 'core_glow', 'acid_glow', 'acid_up', 'crystal_glow', 'acid_fleck']);

function guid() { return crypto.randomUUID(); }

class Model {
  constructor(opts = {}) {
    this.identifier = opts.identifier || 'gel_slime';
    this.projectName = opts.projectName || this.identifier + '.geo';
    this.resolution = opts.resolution || { width: 128, height: 128 };
    this.visibleBox = opts.visibleBox || [2, 2, 2];
    this.visibleOffset = opts.visibleOffset || [0, 1, 0];
    this.bones = [];
    this._boneByName = new Map();
    this.cubes = [];
    this.warnings = [];
  }
  /** Declare a bone/group. parent = bone name or null. */
  bone(name, opts = {}) {
    if (this._boneByName.has(name)) throw new Error('duplicate bone: ' + name);
    const parent = opts.parent || null;
    if (parent && !this._boneByName.has(parent)) throw new Error('bone ' + name + ': parent ' + parent + ' must be declared first');
    const b = {
      name: name, parent: parent,
      uuid: opts.uuid || guid(),
      pivot: opts.pivot || [0, 0, 0],
      rotation: opts.rotation || [0, 0, 0],
      color: this.bones.length % 10,
      mirror_uv: !!opts.mirror_uv,
      cubes: [],
    };
    this.bones.push(b); this._boneByName.set(name, b);
    return b;
  }
  boneRef(name) { const b = this._boneByName.get(name); if (!b) throw new Error('unknown bone: ' + name); return b; }
  /**
   * Add a cube. from/to are model-space corners (from < to on every axis).
   * faces: {north|east|south|west|up|down: minFirstRect|null}  null => unused face
   */
  cube(boneName, name, from, to, faces, opts = {}) {
    const bone = this.boneRef(boneName);
    if (this.cubes.some(c => c.name === name)) throw new Error('duplicate cube name: ' + name);
    const size = to.map((v, i) => v - from[i]);
    for (let i = 0; i < 3; i++) {
      if (size[i] < 0) throw new Error('cube ' + name + ': negative size on axis ' + i);
      if (size[i] === 0 && !opts.allowFlat) this.warnings.push('cube ' + name + ': zero size on axis ' + i);
      if (Math.abs(size[i] - Math.round(size[i])) > 0.001) this.warnings.push('cube ' + name + ': non-integer size ' + size[i].toFixed(3) + ' on axis ' + i);
    }
    const want = {
      north: [size[0], size[1]], south: [size[0], size[1]],
      east: [size[2], size[1]], west: [size[2], size[1]],
      up: [size[0], size[2]], down: [size[0], size[2]],
    };
    const spec = {};
    for (const f of FACES) {
      let rect = faces[f];
      let family = null;
      if (rect && !Array.isArray(rect)) { family = rect.family; rect = rect.rect; }
      if (!rect) { spec[f] = null; continue; }
      if (!Array.isArray(rect) || rect.length !== 4) throw new Error('cube ' + name + ' face ' + f + ': expected [a,b,c,d] rect');
      const got = [Math.round(Math.abs(rect[2] - rect[0]) * 1000) / 1000, Math.round(Math.abs(rect[3] - rect[1]) * 1000) / 1000];
      if (!opts.quiet && (Math.abs(got[0] - want[f][0]) > 0.51 || Math.abs(got[1] - want[f][1]) > 0.51)) {
        this.warnings.push('cube ' + name + ' face ' + f + ': uv ' + got + ' vs face size ' + want[f]);
      }
      spec[f] = { rect: rect.slice(), texture: (family && GLOW_FAMILIES.has(family)) ? 1 : 0 };
    }
    const cube = {
      name: name, bone: boneName, from: from.slice(), to: to.slice(), size: size, faces: spec,
      inflate: opts.inflate || 0, rotation: opts.rotation || [0, 0, 0],
      origin: opts.origin || from.slice(), mirror: !!opts.mirror,
      color: opts.color !== undefined ? opts.color : bone.color,
    };
    bone.cubes.push(cube); this.cubes.push(cube);
    return cube;
  }
  all() { return this.cubes; }
  bounds() {
    if (!this.cubes.length) return null;
    const min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
    for (const c of this.cubes) for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], c.from[i]); max[i] = Math.max(max[i], c.to[i]); }
    return { min: min, max: max, size: max.map((v, i) => v - min[i]) };
  }
  toBBModel(opts) {
    const textures = opts.textures || [];
    const elements = [];
    const childrenOf = new Map();
    for (const b of this.bones) childrenOf.set(b.name, []);
    for (const c of this.cubes) {
      const faces = {};
      for (const f of FACES) {
        const ref = c.faces[f];
        faces[f] = ref ? { uv: bbFaceUV(ref.rect, f), texture: ref.texture } : { uv: [0, 0, 0, 0], texture: null };
      }
      const el = {
        name: c.name, box_uv: false, render_order: 'default', locked: false, export: true, scope: 0,
        allow_mirror_modeling: true, from: c.from.slice(), to: c.to.slice(), autouv: 0, color: c.color,
        origin: c.origin.slice(), faces: faces, type: 'cube', uuid: guid(),
      };
      if (c.inflate) el.inflate = c.inflate;
      if (c.rotation.some(v => v)) el.rotation = c.rotation.slice();
      elements.push(el);
      childrenOf.get(c.bone).push(el.uuid);
    }
    const groups = this.bones.map(b => ({
      name: b.name, uuid: b.uuid, export: true, locked: false, scope: 0, selected: false, visibility: true,
      _static: { properties: {}, temp_data: {} }, origin: b.pivot.slice(), rotation: b.rotation.slice(),
      bedrock_binding: '', color: b.color, children: [], reset: false, shade: true, mirror_uv: b.mirror_uv,
      autouv: 0, isOpen: false, primary_selected: false,
    }));
    const groupByUuid = new Map(groups.map(g => [g.uuid, g]));
    // Blockbench rebuilds the rig from `outliner` ONLY: the tree (groups + element uuids) must
    // live inside the outliner nodes; the group records are metadata and keep an empty children[].
    const nodes = new Map(this.bones.map(b => [b.uuid, { uuid: b.uuid, isOpen: false, children: childrenOf.get(b.name).slice() }]));
    const outliner = [];
    for (const b of this.bones) {
      const node = nodes.get(b.uuid);
      if (!b.parent) outliner.push(node);
      else nodes.get(this.boneRef(b.parent).uuid).children.push(node);
    }
    const tex = textures.map((t, i) => ({
      name: t.name, id: String(i), group: '', scope: 0,
      width: this.resolution.width, height: this.resolution.height,
      uv_width: this.resolution.width, uv_height: this.resolution.height,
      particle: false, use_as_default: i === 0, layers_enabled: false, internal: true, saved: false,
      uuid: guid(), source: 'data:image/png;base64,' + t.png.toString('base64'),
      render_mode: t.renderMode || 'default', render_sides: 'auto', pbr_channel: 'color', wrap_mode: 'repeat',
      fps: 10, frame_time: 1, frame_order_type: 'loop', frame_interpolate: false, visible: true,
    }));
    return {
      meta: { format_version: '5.0', model_format: 'bedrock', box_uv: false },
      name: this.projectName,
      model_identifier: this.identifier,
      visible_box: this.visibleBox,
      variable_placeholders: '',
      multi_file_ruleset: '',
      variable_placeholder_buttons: [],
      bedrock_animation_mode: 'entity',
      timeline_setups: [],
      unhandled_root_fields: {},
      resolution: { width: this.resolution.width, height: this.resolution.height },
      elements: elements,
      groups: groups,
      outliner: outliner,
      textures: tex,
      animations: [],
    };
  }
  toGeoJSON() {
    const bones = this.bones.map(b => {
      const out = { name: b.name };
      if (b.parent) out.parent = b.parent;
      out.pivot = b.pivot.slice();
      if (b.rotation.some(v => v)) out.rotation = b.rotation.slice();
      if (b.cubes.length) {
        out.cubes = b.cubes.map(c => {
          const cube = { origin: c.from.slice(), size: c.size.slice() };
          if (c.inflate) cube.inflate = c.inflate;
          if (c.rotation.some(v => v)) { cube.pivot = c.origin.slice(); cube.rotation = c.rotation.slice(); }
          const uvs = {};
          let any = false;
          for (const f of FACES) { const ref = c.faces[f]; if (!ref) continue; uvs[f] = geoFaceUV(ref.rect, f); any = true; }
          if (any) cube.uv = uvs;
          return cube;
        });
      }
      return out;
    });
    return {
      format_version: '1.12.0',
      'minecraft:geometry': [{
        description: {
          identifier: 'geometry.' + this.identifier,
          texture_width: this.resolution.width,
          texture_height: this.resolution.height,
          visible_bounds_width: this.visibleBox[0],
          visible_bounds_height: this.visibleBox[1],
          visible_bounds_offset: this.visibleOffset.slice(),
        },
        bones: bones,
      }],
    };
  }
}

/** Tolerance-based keyframe simplifier (per channel, in channel units).
 *  Only runs of keys WITHOUT easing are thinned: a key is dropped when the chord between the
 *  kept neighbours stays within tolerance on every axis, so eased (hand-authored) curves are
 *  never touched. This is what keeps the sampled trailing-chain channels from bloating the
 *  exported file. */
function simplifyKeys(keys, tol) {
  if (keys.length <= 2) return keys;
  const out = [keys[0]];
  let anchor = 0;
  for (let i = 1; i < keys.length - 1; i++) {
    let eased = false;
    for (let j = anchor; j <= i; j++) if (keys[j].length > 2) { eased = true; break; }
    if (eased) { out.push(keys[i]); anchor = i; continue; }
    const t0 = keys[anchor][0], t1 = keys[i + 1][0], v0 = keys[anchor][1], v1 = keys[i + 1][1];
    let ok = true;
    for (let k = anchor + 1; k <= i && ok; k++) {
      const u = t1 === t0 ? 0 : (keys[k][0] - t0) / (t1 - t0);
      for (let c = 0; c < 3; c++) {
        if (Math.abs(keys[k][1][c] - (v0[c] + (v1[c] - v0[c]) * u)) > tol[c]) { ok = false; break; }
      }
    }
    if (!ok) { out.push(keys[i]); anchor = i; }
  }
  out.push(keys[keys.length - 1]);
  return out;
}

class AnimationSet {
  constructor(identifier) { this.identifier = identifier; this.clips = []; }
  /**
   * @param state clip name suffix, e.g. 'idle'
   * @param opts {length, loop:true|false|'hold_on_last_frame', bones:{bone:{rotation:[[t,[x,y,z],easing?],...],...}}}
   */
  clip(state, opts) {
    const bones = {};
    for (const boneName of Object.keys(opts.bones || {})) {
      const channels = opts.bones[boneName];
      const out = {};
      for (const ch of Object.keys(channels)) {
        const tol = ch === 'rotation' ? [0.35, 0.35, 0.35] : (ch === 'position' ? [0.02, 0.02, 0.02] : [0.004, 0.004, 0.004]);
        const entries = simplifyKeys(channels[ch], tol);
        const chObj = {};
        for (const entry of entries) {
          // lagged channels (trailing lobes/antennae/drips) may push a key past the end of the
          // clip; clamp it to the clip length so the exported animation stays in range (the
          // clamped rest key then wins over the un-lagged rest key at the same time).
          const time = Math.min(Math.max(entry[0], 0), opts.length);
          const val = entry[1];
          const easing = entry[2];
          const key = Number.isInteger(time) ? time.toFixed(1) : String(time);
          chObj[key] = easing ? { vector: val, easing: easing } : { vector: val };
        }
        out[ch] = chObj;
      }
      bones[boneName] = out;
    }
    const loop = opts.loop === undefined ? true : opts.loop;
    this.clips.push({ name: 'animation.' + this.identifier + '.' + state, tag: { loop: loop, animation_length: opts.length, bones: bones } });
    return this;
  }
  toJSON() {
    const animations = {};
    for (const c of this.clips) animations[c.name] = c.tag;
    return { format_version: '1.8.0', animations: animations };
  }
  toBBModelAnimations(boneUuid) {
    const out = [];
    for (const c of this.clips) {
      const animators = {};
      for (const boneName of Object.keys(c.tag.bones)) {
        const channels = c.tag.bones[boneName];
        const keyframes = [];
        for (const ch of Object.keys(channels)) {
          for (const time of Object.keys(channels[ch])) {
            const data = channels[ch][time];
            const kf = {
              channel: ch, time: parseFloat(time), color: -1, uniform: ch === 'scale',
              interpolation: 'linear', data_points: [{ x: data.vector[0], y: data.vector[1], z: data.vector[2] }],
              uuid: guid(),
            };
            if (data.easing) kf.easing = data.easing;
            keyframes.push(kf);
          }
        }
        keyframes.sort((a, b) => a.time - b.time);
        animators[boneUuid(boneName)] = { name: boneName, type: 'bone', keyframes: keyframes };
      }
      out.push({
        uuid: guid(), name: c.name,
        loop: c.tag.loop === true ? 'loop' : (c.tag.loop === 'hold_on_last_frame' ? 'hold' : 'once'),
        override: false, selected: false, length: c.tag.animation_length, snapping: 24,
        animators: animators, markers: [], type: 'animation', path: '',
      });
    }
    return out;
  }
}

function writeJSON(file, obj) { fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n'); }

module.exports = { Model: Model, AnimationSet: AnimationSet, writeJSON: writeJSON, guid: guid, FACES: FACES, GLOW_FAMILIES: GLOW_FAMILIES };
