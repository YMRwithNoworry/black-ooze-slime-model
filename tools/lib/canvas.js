'use strict';
// Pixel canvas + palette + tile view helpers shared by every producer.
const PALETTE = {
  // --- gel body (mint/teal, cute) ---
  gelHi:      '#c8ffe6', gelLight:  '#93eec4', gelMid:   '#5fc79b',
  gelMidDark: '#3ea07a', gelDark:   '#2a7358', gelDeep:  '#17453a',
  gelRim:     '#0e2c26', gelWet:    '#b8f7dd', gelShadow:'#123830',
  // --- acid (danger glow) ---
  acidPale:   '#f2ffb0', acidBright:'#d7ff5c', acid:     '#b0ef35',
  acidDeep:   '#79c31c', acidDark:  '#4d8a10', acidVein: '#8fff7a',
  // --- crystal (dark danger core) ---
  xtalDark:   '#1d1832', xtalMid:   '#332a58', xtalLight:'#4f4187',
  xtalEdge:   '#6f5fb5', xtalGlow:  '#9fe9ff', xtalGlowHi:'#e2fbff',
  // --- eyes (huge, glossy, cute) ---
  eyePit:     '#0b1a1f', eyeDark:   '#12303c', eyeMid:   '#21556b',
  eyeGlass:   '#3d8ba8', irisTeal:  '#41e6c8', irisLime: '#a9ff5e',
  eyeSpark:   '#ffffff', eyeSpark2: '#d9fff4',
  // --- mouth / maw / teeth (the cute-but-deadly grin) ---
  lipDark:    '#123028', lipLine:   '#081713', mawDeep:  '#250d18',
  mawInner:   '#3f1524', mawTongue: '#8d2f4a', mawTongueHi: '#c05a75',
  tooth:      '#f4fbff', toothShade:'#c2d6e0', toothEdge:'#8aa3b0',
  // --- misc ---
  void:       '#0a0f14', bone:      '#e9f3f2', shadow:   '#12302c',
};

function hexToRgb(hex) {
  const v = hex.replace('#', '');
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}
function rgb(name) {
  const p = PALETTE[name];
  if (!p) throw new Error('unknown palette color: ' + name);
  return hexToRgb(p);
}
function shade(name, amount) { // amount -1..1 -> darker/lighter
  const [r, g, b] = rgb(name);
  const f = a => Math.max(0, Math.min(255, Math.round(a + (amount > 0 ? (255 - a) * amount : a * amount))));
  return [f(r), f(g), f(b)];
}
function withAlpha(c, a) { return [c[0], c[1], c[2], a]; }

class Canvas {
  constructor(w, h, fill) {
    this.width = w; this.height = h;
    this.pixels = Buffer.alloc(w * h * 4);
    if (fill) this.clear(fill);
  }
  clear(c) { for (let y = 0; y < this.height; y++) for (let x = 0; x < this.width; x++) this.set(x, y, c); }
  inside(x, y) { return x >= 0 && y >= 0 && x < this.width && y < this.height; }
  set(x, y, c) {
    if (!this.inside(x, y)) return;
    const i = ((y | 0) * this.width + (x | 0)) * 4;
    this.pixels[i] = c[0]; this.pixels[i + 1] = c[1]; this.pixels[i + 2] = c[2];
    this.pixels[i + 3] = c.length > 3 ? c[3] : 255;
  }
  get(x, y) { if (!this.inside(x, y)) return [0, 0, 0, 0]; const i = ((y | 0) * this.width + (x | 0)) * 4; return [this.pixels[i], this.pixels[i + 1], this.pixels[i + 2], this.pixels[i + 3]]; }
  blend(x, y, c, a) {
    if (!this.inside(x, y)) return;
    const o = this.get(x, y); const k = Math.max(0, Math.min(1, a)), ia = 1 - k;
    this.set(x, y, [Math.round(o[0] * ia + c[0] * k), Math.round(o[1] * ia + c[1] * k), Math.round(o[2] * ia + c[2] * k),
      c.length > 3 ? Math.round(o[3] * ia + c[3] * k) : o[3]]);
  }
  rect(x, y, w, h, c) { for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) this.set(x + xx, y + yy, c); return this; }
  outline(x, y, w, h, c) {
    for (let xx = 0; xx < w; xx++) { this.set(x + xx, y, c); this.set(x + xx, y + h - 1, c); }
    for (let yy = 0; yy < h; yy++) { this.set(x, y + yy, c); this.set(x + w - 1, y + yy, c); }
    return this;
  }
  hline(x, y, w, c) { for (let i = 0; i < w; i++) this.set(x + i, y, c); return this; }
  vline(x, y, h, c) { for (let i = 0; i < h; i++) this.set(x, y + i, c); return this; }
  line(x0, y0, x1, y1, c) {
    let dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1, dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1, err = dx + dy;
    for (;;) { this.set(x0, y0, c); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } }
    return this;
  }
  fillPoly(pts, c) {
    const ys = pts.map(p => p[1]);
    const y0 = Math.floor(Math.min(...ys)), y1 = Math.ceil(Math.max(...ys));
    for (let y = y0; y <= y1; y++) {
      const xs = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) xs.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
      }
      xs.sort((p, q) => p - q);
      for (let i = 0; i + 1 < xs.length; i += 2) for (let x = Math.ceil(xs[i]); x <= Math.floor(xs[i + 1]); x++) this.set(x, y, c);
    }
    return this;
  }
  circle(cx, cy, r, c) {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++)
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) this.set(x, y, c);
    return this;
  }
  /** vertical gradient rect: colorTop -> colorBottom (linear) */
  vgrad(x, y, w, h, top, bottom) {
    for (let yy = 0; yy < h; yy++) {
      const t = h <= 1 ? 0 : yy / (h - 1);
      const c = [0, 1, 2].map(i => Math.round(top[i] * (1 - t) + bottom[i] * t));
      for (let xx = 0; xx < w; xx++) this.set(x + xx, y + yy, c);
    }
    return this;
  }
  hgrad(x, y, w, h, left, right) {
    for (let xx = 0; xx < w; xx++) {
      const t = w <= 1 ? 0 : xx / (w - 1);
      const c = [0, 1, 2].map(i => Math.round(left[i] * (1 - t) + right[i] * t));
      for (let yy = 0; yy < h; yy++) this.set(x + xx, y + yy, c);
    }
    return this;
  }
  /** additive glow bloom around (cx,cy) with radius r */
  bloom(cx, cy, r, c, strength = 0.7) {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const d = Math.hypot(x - cx, y - cy); if (d > r) continue;
      this.blend(x, y, c, strength * (1 - d / r));
    }
    return this;
  }
  shadowInner(x, y, w, h, c, strength = 0.5) { // darken inside border
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
      const d = Math.min(xx, yy, w - 1 - xx, h - 1 - yy);
      if (d === 0) this.blend(x + xx, y + yy, c, strength * 0.7);
      else if (d === 1) this.blend(x + xx, y + yy, c, strength * 0.25);
    }
    return this;
  }
  copyRect(sx, sy, w, h, dx, dy) {
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) this.set(dx + xx, dy + yy, this.get(sx + xx, sy + yy));
    return this;
  }
  countOpaque() { let n = 0; for (let i = 3; i < this.pixels.length; i += 4) if (this.pixels[i] > 0) n++; return n; }
}

/** Deterministic PRNG so producers/verifiers can reproduce identical pixels. */
function prng(seed) {
  let s = 0; const str = String(seed);
  for (let i = 0; i < str.length; i++) s = (s * 31 + str.charCodeAt(i)) >>> 0;
  s = s || 1;
  return function next() { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

/** Tile-local painter: all coordinates are relative to the tile's rect. */
class TileView {
  constructor(canvas, tile) { this.canvas = canvas; this.tile = tile; this.w = tile.w; this.h = tile.h; this.x = tile.x; this.y = tile.y; }
  set(x, y, c) { return this.canvas.set(this.x + x, this.y + y, c); }
  get(x, y) { return this.canvas.get(this.x + x, this.y + y); }
  rect(x, y, w, h, c) { return this.canvas.rect(this.x + x, this.y + y, w, h, c); }
  outline(x, y, w, h, c) { return this.canvas.outline(this.x + x, this.y + y, w, h, c); }
  hline(x, y, w, c) { return this.canvas.hline(this.x + x, this.y + y, w, c); }
  vline(x, y, h, c) { return this.canvas.vline(this.x + x, this.y + y, h, c); }
  line(x0, y0, x1, y1, c) { return this.canvas.line(this.x + x0, this.y + y0, this.x + x1, this.y + y1, c); }
  fillPoly(pts, c) { return this.canvas.fillPoly(pts.map(p => [this.x + p[0], this.y + p[1]]), c); }
  circle(cx, cy, r, c) { return this.canvas.circle(this.x + cx, this.y + cy, r, c); }
  vgrad(x, y, w, h, top, bottom) { return this.canvas.vgrad(this.x + x, this.y + y, w, h, top, bottom); }
  hgrad(x, y, w, h, left, right) { return this.canvas.hgrad(this.x + x, this.y + y, w, h, left, right); }
  blend(x, y, c, a) { return this.canvas.blend(this.x + x, this.y + y, c, a); }
  bloom(cx, cy, r, c, s) { return this.canvas.bloom(this.x + cx, this.y + cy, r, c, s); }
  shadowInner(x, y, w, h, c, s) { return this.canvas.shadowInner(this.x + x, this.y + y, w, h, c, s); }
}

module.exports = { PALETTE, rgb, shade, withAlpha, hexToRgb, Canvas, TileView, prng };
