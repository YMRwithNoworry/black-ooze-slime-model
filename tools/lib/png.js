'use strict';
// Minimal dependency-free PNG encoder/decoder (8-bit RGB/RGBA, no interlace).
const zlib = require('zlib');

function crcTable() {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c; }
  return t;
}
const CRC = crcTable();
function crc32(buf) { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

/** Encode RGBA pixels (Buffer, w*h*4) into a PNG buffer. */
function encode(w, h, pixels) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter: none
    pixels.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function paeth(a, b, c) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }

/** Decode a PNG buffer -> {width, height, pixels: Buffer RGBA}. Throws on unsupported input. */
function decode(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let off = 8, w = 0, h = 0, depth = 8, color = 6, interlace = 0;
  const idat = [];
  let palette = null, trns = null;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off); const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.slice(off + 8, off + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; color = data[9]; interlace = data[12]; }
    else if (type === 'PLTE') palette = Buffer.from(data);
    else if (type === 'tRNS') trns = Buffer.from(data);
    else if (type === 'IDAT') idat.push(Buffer.from(data));
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (depth !== 8) throw new Error('unsupported bit depth ' + depth);
  if (interlace !== 0) throw new Error('interlaced PNG unsupported');
  const chans = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[color];
  if (!chans) throw new Error('unsupported color type ' + color);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * chans;
  const out = Buffer.alloc(w * h * 4);
  const line = Buffer.alloc(stride);
  const prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)];
    const src = raw.slice(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= chans ? line[i - chans] : 0, b = prev[i], c = i >= chans ? prev[i - chans] : 0;
      let v = src[i];
      if (ft === 1) v += a; else if (ft === 2) v += b; else if (ft === 3) v += (a + b) >> 1;
      else if (ft === 4) v += paeth(a, b, c);
      line[i] = v & 0xff;
    }
    for (let x = 0; x < w; x++) {
      const i = x * chans, o = (y * w + x) * 4;
      if (color === 6) { out[o] = line[i]; out[o + 1] = line[i + 1]; out[o + 2] = line[i + 2]; out[o + 3] = line[i + 3]; }
      else if (color === 2) { out[o] = line[i]; out[o + 1] = line[i + 1]; out[o + 2] = line[i + 2]; out[o + 3] = 255; }
      else if (color === 0) { out[o] = out[o + 1] = out[o + 2] = line[i]; out[o + 3] = 255; }
      else if (color === 4) { out[o] = out[o + 1] = out[o + 2] = line[i]; out[o + 3] = line[i + 1]; }
      else if (color === 3) { const p = line[i] * 3; out[o] = palette[p]; out[o + 1] = palette[p + 1]; out[o + 2] = palette[p + 2]; out[o + 3] = (trns && line[i] < trns.length) ? trns[line[i]] : 255; }
    }
    line.copy(prev);
  }
  return { width: w, height: h, pixels: out };
}

module.exports = { encode, decode, crc32 };
