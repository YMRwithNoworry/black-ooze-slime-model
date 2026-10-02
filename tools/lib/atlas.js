'use strict';
// UV atlas planning + the verified Blockbench/Bedrock face-UV conventions.
//
// VERIFIED against a Blockbench-produced pair (refs/infested_zombie.bbmodel vs its
// exported geo.json): 141 faces, 0 mismatches.
//
//   A face has a "min-first" rect [a,b,c,d] (a<c, b<d) in texture pixel space, origin top-left.
//   .bbmodel storage:  north/east/south/west -> [a,b,c,d] ; up -> [c,d,a,b] ; down -> [c,b,a,d]
//   .geo.json export:  all but down -> uv=[a,b], uv_size=[c-a, d-b]
//                      down        -> uv=[a,d], uv_size=[c-a, b-d]
const FACES = ['north', 'east', 'south', 'west', 'up', 'down'];

function bbFaceUV(rect, face) {
  const [a, b, c, d] = rect;
  if (face === 'up') return [c, d, a, b];
  if (face === 'down') return [c, b, a, d];
  return [a, b, c, d];
}
function geoFaceUV(rect, face) {
  const [a, b, c, d] = rect;
  if (face === 'down') return { uv: [a, d], uv_size: [c - a, b - d] };
  return { uv: [a, b], uv_size: [c - a, d - b] };
}

class Atlas {
  /** @param w atlas width @param h atlas height @param pad padding between tiles */
  constructor(w, h, pad = 1) {
    this.width = w; this.height = h; this.pad = pad;
    this.tiles = new Map();
    this.list = [];
    this._shelfY = 0; this._shelfX = 0; this._shelfH = 0;
    this.warnings = [];
  }
  /**
   * Allocate a tile. `family` drives how the texture artist paints it.
   * @returns {object} tile {name, x, y, w, h, family, params}
   */
  alloc(name, w, h, family, params = {}) {
    if (this.tiles.has(name)) throw new Error('duplicate atlas tile: ' + name);
    w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
    if (this._shelfX + w > this.width) { this._shelfY += this._shelfH + this.pad; this._shelfX = 0; this._shelfH = 0; }
    if (this._shelfY + h > this.height) throw new Error('atlas overflow placing ' + name + ' (' + w + 'x' + h + ')');
    const tile = { name, x: this._shelfX, y: this._shelfY, w, h, family, params, rect: [this._shelfX, this._shelfY, this._shelfX + w, this._shelfY + h] };
    this.tiles.set(name, tile); this.list.push(tile);
    this._shelfX += w + this.pad; this._shelfH = Math.max(this._shelfH, h);
    if (family === 'void') tile.void = true;
    return tile;
  }
  get(name) { const t = this.tiles.get(name); if (!t) throw new Error('unknown atlas tile: ' + name); return t; }
  has(name) { return this.tiles.has(name); }
  /** whole-tile rect, or a sub-rect anchored at the tile's top-left when a size is given */
  face(name, size) {
    const t = this.get(name);
    if (!size) return { rect: t.rect.slice(), family: t.family, tile: t.name };
    const [w, h] = size;
    if (w > t.w + 0.001 || h > t.h + 0.001) {
      this.warnings.push(`tile ${name} (${t.w}x${t.h}) stretched by face ${w}x${h}`);
      return { rect: t.rect.slice(), family: t.family, tile: t.name };
    }
    if (Math.abs(w - t.w) > 0.001 || Math.abs(h - t.h) > 0.001) {
      this.warnings.push(`tile ${name} (${t.w}x${t.h}) used by face ${w}x${h}`);
    }
    return { rect: [t.rect[0], t.rect[1], t.rect[0] + w, t.rect[1] + h], family: t.family, tile: t.name };
  }
  /** every pixel cell claimed by tiles (for verification) */
  coverage() {
    const map = new Map();
    for (const t of this.list) for (let y = t.y; y < t.y + t.h; y++) for (let x = t.x; x < t.x + t.w; x++) {
      const k = y * this.width + x;
      if (map.has(k)) throw new Error(`atlas tile overlap at ${x},${y}: ${map.get(k)} and ${t.name}`);
      map.set(k, t.name);
    }
    return map;
  }
  rectsOverlap(a, b) { return a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]; }
  toJSON() { return { width: this.width, height: this.height, tiles: this.list.map(t => ({ name: t.name, rect: t.rect, family: t.family, params: t.params })) }; }
}

module.exports = { Atlas, FACES, bbFaceUV, geoFaceUV };
