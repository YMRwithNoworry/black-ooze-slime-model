'use strict';
// 史莱姆少女 / SLIME GIRL — the seven GeckoLib clips.  OWNER: lead.
//
// Every clip is authored the same way: the body leads and the gel lags it.  The hair strands,
// the ears, the floating voxels and the six slime blobs all get their own channel with a phase
// offset and a decaying amplitude, which is what makes the transparent hair feel like jelly
// instead of like a helmet.

const sin = (x) => Math.sin(x * Math.PI * 2);
const cos = (x) => Math.cos(x * Math.PI * 2);
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (v) => { const t = clamp01(v); return t * t * (3 - 2 * t); };
function lerp(a, b, t) { return a + (b - a) * clamp01(t); }

/** sample a clip into n+1 evenly spaced keys */
function sample(len, n, fn) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = len * i / n;
    out.push([t, fn(t / len)]);
  }
  return out;
}
function rot(len, n, fn) { return { rotation: sample(len, n, fn) }; }

const HAIR = ['bangs', 'sidehair_l', 'sidehair_r', 'backhair'];
const FLOATERS = ['hairblock_a', 'hairblock_b', 'hairblock_c', 'hairblock_d'];
const BLOBS = ['slimeblob_ff', 'slimeblob_r', 'slimeblob_o', 'slimeblob_b', 'slimeblob_t', 'slimeblob_bb'];
const SIDE = { sidehair_l: -1, sidehair_r: 1, ear_l: -1, ear_r: 1, arm_l: -1, arm_r: 1, leg_l: -1, leg_r: 1 };

function build({ anim, bones, pivots, rigHeight }) {
  const notes = [];
  const has = (n) => bones.indexOf(n) >= 0;

  // ---------------------------------------------------------------- idle ----
  (function idle() {
    const L = 4.0, N = 16;
    const b = {};
    b.root = { position: sample(L, N, (t) => [0, 0.28 * sin(t) + 0.06 * sin(t * 2), 0]) };
    b.body = {
      scale: sample(L, N, (t) => [1 + 0.012 * sin(t), 1 - 0.018 * sin(t), 1 + 0.012 * sin(t)]),
      rotation: sample(L, N, (t) => [0.5 * sin(t * 2), 0.8 * sin(t), 1.1 * sin(t)]),
    };
    b.hips = rot(L, N, (t) => [0, -0.6 * sin(t), -0.5 * sin(t)]);
    b.chest = rot(L, N, (t) => [0.4 * sin(t * 2), 0.7 * sin(t), 0.6 * sin(t)]);
    b.head = rot(L, N, (t) => [1.0 * sin(t * 2 + 0.15), -0.9 * sin(t), -1.6 * sin(t)]);
    HAIR.forEach((name, i) => { if (!has(name)) return;
      const lag = 0.09 * (i + 1);
      b[name] = rot(L, N, (t) => [3.0 * sin(t - lag), 0, 1.4 * sin(t * 2 - lag)]);
    });
    if (has('ahoge')) b.ahoge = rot(L, N, (t) => [0, 4.0 * sin(t * 2 - 0.1), -2.5 * sin(t)]);
    ['ear_l', 'ear_r'].forEach((name) => { if (!has(name)) return;
      b[name] = rot(L, N, (t) => [2.0 * sin(t - 0.12), 0, SIDE[name] * 4.0 * sin(t - 0.08)]);
    });
    FLOATERS.forEach((name, i) => { if (!has(name)) return;
      b[name] = {
        rotation: sample(L, N, (t) => [5.0 * sin(t - i * 0.1), 4.0 * sin(t * 2 - i * 0.15), 6.0 * sin(t - i * 0.2)]),
        position: sample(L, N, (t) => [0, 1.1 * sin(t - i * 0.12), 0]),
      };
    });
    BLOBS.forEach((name, i) => { if (!has(name)) return;
      b[name] = {
        position: sample(L, N, (t) => [0.5 * sin(t - i * 0.09), 1.3 * sin(t - i * 0.07), 0.4 * cos(t - i * 0.1)]),
        rotation: sample(L, N, (t) => [0, 10.0 * sin(t - i * 0.1), 0]),
      };
    });
    ['arm_l', 'arm_r'].forEach((name) => { if (!has(name)) return;
      b[name] = rot(L, N, (t) => [1.6 * sin(t - 0.05), 0, SIDE[name] * (1.8 + 1.2 * sin(t - 0.05))]);
    });
    ['leg_l', 'leg_r'].forEach((name) => { if (!has(name)) return;
      b[name] = rot(L, N, (t) => [0.8 * sin(t), 0, 0]);
    });
    anim.clip('idle', { length: L, loop: true, bones: b });
  })();

  // ---------------------------------------------------------------- move ----
  (function move() {
    const L = 1.0, N = 12;
    const b = {};
    // one hop: compress, kick off, fly, land, settle
    const hop = (t) => {
      if (t < 0.20) return -1.2 * smooth(t / 0.20);
      if (t < 0.55) return -1.2 + 4.6 * smooth((t - 0.20) / 0.35);
      if (t < 0.78) return 3.4 - 4.6 * smooth((t - 0.55) / 0.23);
      return -1.2 + 1.2 * smooth((t - 0.78) / 0.22);
    };
    const squash = (t) => {
      if (t < 0.20) return 1 - 0.16 * smooth(t / 0.20);
      if (t < 0.55) return 0.84 + 0.24 * smooth((t - 0.20) / 0.35);
      if (t < 0.78) return 1.08 - 0.24 * smooth((t - 0.55) / 0.23);
      return 0.84 + 0.16 * smooth((t - 0.78) / 0.22);
    };
    b.root = { position: sample(L, N, (t) => [0, hop(t), 0]) };
    b.body = {
      scale: sample(L, N, (t) => { const s = squash(t); return [1 + (1 - s) * 0.6, s, 1 + (1 - s) * 0.6]; }),
      rotation: sample(L, N, (t) => [6.0 * sin(t) * (t < 0.55 ? 1 : -0.4), 0, 2.0 * sin(t)]),
    };
    b.head = rot(L, N, (t) => [-5.0 * sin(t) * (t < 0.55 ? 1 : -0.5), 0, -2.0 * sin(t)]);
    HAIR.forEach((name, i) => { if (!has(name)) return;
      const lag = 0.10 + i * 0.05;
      b[name] = rot(L, N, (t) => [-9.0 * sin(t - lag), 0, 3.0 * cos(t - lag)]);
    });
    if (has('ahoge')) b.ahoge = rot(L, N, (t) => [-14.0 * sin(t - 0.14), 0, 5.0 * cos(t - 0.1)]);
    ['ear_l', 'ear_r'].forEach((name) => { if (!has(name)) return;
      b[name] = rot(L, N, (t) => [-8.0 * sin(t - 0.16), 0, SIDE[name] * 9.0 * cos(t - 0.12)]);
    });
    FLOATERS.forEach((name, i) => { if (!has(name)) return;
      b[name] = { rotation: sample(L, N, (t) => [12.0 * sin(t - i * 0.08), 8.0 * cos(t - i * 0.1), 10.0 * sin(t - i * 0.12)]) };
    });
    BLOBS.forEach((name, i) => { if (!has(name)) return;
      b[name] = { position: sample(L, N, (t) => [0, 1.6 * sin(t - i * 0.06), 0]) };
    });
    ['arm_l', 'arm_r'].forEach((name) => { if (!has(name)) return;
      b[name] = rot(L, N, (t) => [-16.0 * sin(t - 0.05), 0, SIDE[name] * 4.0]);
    });
    ['leg_l', 'leg_r'].forEach((name) => { if (!has(name)) return;
      b[name] = rot(L, N, (t) => [10.0 * sin(t), 0, 0]);
    });
    anim.clip('move', { length: L, loop: true, bones: b });
  })();

  // -------------------------------------------------------------- attack ----
  (function attack() {
    const L = 1.25, N = 14;
    const b = {};
    const wind = (t) => smooth((t - 0.0) / 0.32);
    const strike = (t) => smooth((t - 0.32) / 0.18);
    const back = (t) => smooth((t - 0.55) / 0.45);
    b.root = { position: sample(L, N, (t) => [0, 0.4 * wind(t) + 1.6 * strike(t) - 2.0 * back(t), 0]) };
    b.body = rot(L, N, (t) => [-9.0 * wind(t) + 18.0 * strike(t) - 9.0 * back(t), 0, 0]);
    b.hips = rot(L, N, (t) => [-4.0 * wind(t) + 8.0 * strike(t) - 4.0 * back(t), 0, 0]);
    b.chest = rot(L, N, (t) => [-6.0 * wind(t) + 12.0 * strike(t) - 6.0 * back(t), 0, 0]);
    b.head = rot(L, N, (t) => [6.0 * wind(t) - 14.0 * strike(t) + 8.0 * back(t), 0, 0]);
    HAIR.forEach((name, i) => { if (!has(name)) return;
      const lag = 0.06 + i * 0.04;
      const f = (t) => { const u = clamp01((t - lag) / (1 - lag)); return 14.0 * wind(u) - 30.0 * strike(u) + 16.0 * back(u); };
      b[name] = { rotation: sample(L, N, (t) => [f(t), 0, 3.0 * sin(t * 2)]) };
    });
    if (has('ahoge')) b.ahoge = rot(L, N, (t) => [22.0 * wind(t) - 44.0 * strike(t) + 22.0 * back(t), 0, 0]);
    ['ear_l', 'ear_r'].forEach((name) => { if (!has(name)) return;
      b[name] = rot(L, N, (t) => [12.0 * wind(t) - 26.0 * strike(t) + 14.0 * back(t), 0, SIDE[name] * 12.0 * strike(t)]);
    });
    FLOATERS.forEach((name, i) => { if (!has(name)) return;
      b[name] = { rotation: sample(L, N, (t) => [-16.0 * wind(t) + 34.0 * strike(t) - 18.0 * back(t), 0, 8.0 * sin(t * 2 + i)]) };
    });
    BLOBS.forEach((name, i) => { if (!has(name)) return;
      b[name] = { position: sample(L, N, (t) => [0, 0.8 * sin(t * 3 + i) - 1.6 * strike(t), 0]) };
    });
    ['arm_l', 'arm_r'].forEach((name) => { if (!has(name)) return;
      b[name] = rot(L, N, (t) => [-30.0 * wind(t) + 70.0 * strike(t) - 40.0 * back(t), 0, SIDE[name] * (6.0 + 10.0 * strike(t))]);
    });
    ['leg_l', 'leg_r'].forEach((name) => { if (!has(name)) return;
      b[name] = rot(L, N, (t) => [-6.0 * wind(t) + 14.0 * strike(t) - 8.0 * back(t), 0, 0]);
    });
    anim.clip('attack', { length: L, loop: 'hold_on_last_frame', bones: b });
  })();

  // --------------------------------------------------------------- skill ----
  (function skill() {
    const L = 1.6, N = 16;
    const b = {};
    const gather = (t) => smooth(t / 0.55);
    const burst = (t) => smooth((t - 0.55) / 0.20);
    const settle = (t) => smooth((t - 0.75) / 0.85);
    b.root = { position: sample(L, N, (t) => [0, 0.6 * gather(t) + 2.2 * burst(t) - 2.8 * settle(t), 0]) };
    b.body = {
      scale: sample(L, N, (t) => { const k = 1 + 0.10 * gather(t) + 0.22 * burst(t) - 0.32 * settle(t); return [k, k, k]; }),
      rotation: sample(L, N, (t) => [-6.0 * gather(t) + 10.0 * burst(t) - 4.0 * settle(t), 0, 0]),
    };
    b.chest = rot(L, N, (t) => [-8.0 * gather(t) + 16.0 * burst(t) - 8.0 * settle(t), 0, 0]);
    b.head = rot(L, N, (t) => [-10.0 * gather(t) + 20.0 * burst(t) - 10.0 * settle(t), 0, 0]);
    HAIR.forEach((name, i) => { if (!has(name)) return;
      b[name] = rot(L, N, (t) => [-18.0 * gather(t) + 36.0 * burst(t) - 18.0 * settle(t), 0, 6.0 * sin(t * 2 - i * 0.1)]);
    });
    if (has('ahoge')) b.ahoge = rot(L, N, (t) => [-26.0 * gather(t) + 52.0 * burst(t) - 26.0 * settle(t), 0, 0]);
    ['ear_l', 'ear_r'].forEach((name) => { if (!has(name)) return;
      b[name] = rot(L, N, (t) => [-16.0 * gather(t) + 32.0 * burst(t) - 16.0 * settle(t), 0, SIDE[name] * 18.0 * burst(t)]);
    });
    FLOATERS.forEach((name, i) => { if (!has(name)) return;
      b[name] = {
        position: sample(L, N, (t) => [0, -3.0 * gather(t) + 8.0 * burst(t) - 5.0 * settle(t), 0]),
        scale: sample(L, N, (t) => { const k = 1 - 0.25 * gather(t) + 1.05 * burst(t) - 0.80 * settle(t); return [k, k, k]; }),
        rotation: sample(L, N, (t) => [0, 30.0 * burst(t), 0]),
      };
    });
    BLOBS.forEach((name, i) => { if (!has(name)) return;
      const ph = i * 0.05;
      b[name] = {
        position: sample(L, N, (t) => { const u = clamp01(t - ph); return [0, -2.0 * smooth(u / 0.55) + 6.0 * smooth((u - 0.55) / 0.2) - 4.0 * smooth((u - 0.75) / 0.85), 0]; }),
        scale: sample(L, N, (t) => { const u = clamp01(t - ph); const k = 1 - 0.30 * smooth(u / 0.55) + 1.30 * smooth((u - 0.55) / 0.2) - 1.00 * smooth((u - 0.75) / 0.85); return [k, k, k]; }),
        rotation: sample(L, N, (t) => [0, 40.0 * burst(t), 0]),
      };
    });
    ['arm_l', 'arm_r'].forEach((name) => { if (!has(name)) return;
      b[name] = rot(L, N, (t) => [-20.0 * gather(t) + 150.0 * burst(t) - 130.0 * settle(t), 0, SIDE[name] * (6.0 + 18.0 * gather(t))]);
    });
    ['leg_l', 'leg_r'].forEach((name) => { if (!has(name)) return;
      b[name] = rot(L, N, (t) => [-4.0 * gather(t) + 10.0 * burst(t) - 6.0 * settle(t), 0, 0]);
    });
    anim.clip('skill', { length: L, loop: 'hold_on_last_frame', bones: b });
  })();

  // --------------------------------------------------------------- spawn ----
  (function spawn() {
    const L = 1.4, N = 14;
    const b = {};
    b.root = { position: sample(L, N, (t) => [0, -8.0 * (1 - smooth(t / 0.75)) + 1.4 * Math.sin(t * Math.PI) * (1 - t), 0]) };
    b.body = { scale: sample(L, N, (t) => { const k = 0.45 + 0.55 * smooth(t / 0.75) + 0.14 * Math.exp(-6 * t) * Math.sin(t * 9); return [1 + (1 - k) * 0.5, k, 1 + (1 - k) * 0.5]; }) };
    b.head = rot(L, N, (t) => [-12.0 * (1 - smooth(t / 0.75)), 0, 0]);
    HAIR.forEach((name, i) => { if (!has(name)) return;
      b[name] = rot(L, N, (t) => [-24.0 * (1 - smooth((t - i * 0.03) / 0.8)), 0, 0]);
    });
    if (has('ahoge')) b.ahoge = rot(L, N, (t) => [-34.0 * (1 - smooth(t / 0.8)), 0, 0]);
    ['ear_l', 'ear_r'].forEach((name) => { if (!has(name)) return;
      b[name] = rot(L, N, (t) => [-20.0 * (1 - smooth(t / 0.8)), 0, 0]);
    });
    FLOATERS.concat(BLOBS).forEach((name, i) => { if (!has(name)) return;
      b[name] = { scale: sample(L, N, (t) => { const k = 0.2 + 0.8 * smooth((t - i * 0.03) / 0.8); return [k, k, k]; }) };
    });
    ['arm_l', 'arm_r'].forEach((name) => { if (!has(name)) return;
      b[name] = rot(L, N, (t) => [-30.0 * (1 - smooth(t / 0.8)), 0, SIDE[name] * 10.0]);
    });
    anim.clip('spawn', { length: L, loop: 'hold_on_last_frame', bones: b });
  })();

  // --------------------------------------------------------------- death ----
  (function death() {
    const L = 1.2, N = 14;
    const b = {};
    const fall = (t) => smooth((t - 0.15) / 0.65);
    b.root = { position: sample(L, N, (t) => [0, -5.5 * fall(t), 0]) };
    b.body = {
      rotation: sample(L, N, (t) => [0, 0, 78.0 * fall(t)]),
      scale: sample(L, N, (t) => { const k = 1 - 0.45 * fall(t); return [1 + (1 - k) * 0.7, k, 1 + (1 - k) * 0.7]; }),
    };
    b.head = rot(L, N, (t) => [12.0 * fall(t), 0, 22.0 * fall(t)]);
    HAIR.forEach((name, i) => { if (!has(name)) return;
      b[name] = rot(L, N, (t) => [-14.0 * fall(t), 0, 16.0 * fall(t)]);
    });
    if (has('ahoge')) b.ahoge = rot(L, N, (t) => [-30.0 * fall(t), 0, 0]);
    ['ear_l', 'ear_r'].forEach((name) => { if (!has(name)) return;
      b[name] = rot(L, N, (t) => [-10.0 * fall(t), 0, SIDE[name] * 20.0 * fall(t)]);
    });
    FLOATERS.forEach((name, i) => { if (!has(name)) return;
      b[name] = { position: sample(L, N, (t) => [0, -9.0 * smooth((t - i * 0.04) / 0.8), 0]), scale: sample(L, N, (t) => { const k = 1 - 0.7 * smooth(t / 0.9); return [k, k, k]; }) };
    });
    BLOBS.forEach((name, i) => { if (!has(name)) return;
      b[name] = { position: sample(L, N, (t) => [0, -7.0 * smooth((t - i * 0.04) / 0.8), 0]), scale: sample(L, N, (t) => { const k = 1 - 0.5 * smooth(t / 0.9); return [1 + (1 - k), k, 1 + (1 - k)]; }) };
    });
    ['arm_l', 'arm_r'].forEach((name) => { if (!has(name)) return;
      b[name] = rot(L, N, (t) => [20.0 * fall(t), 0, SIDE[name] * 40.0 * fall(t)]);
    });
    ['leg_l', 'leg_r'].forEach((name) => { if (!has(name)) return;
      b[name] = rot(L, N, (t) => [16.0 * fall(t), 0, SIDE[name] * 26.0 * fall(t)]);
    });
    anim.clip('death', { length: L, loop: 'hold_on_last_frame', bones: b });
  })();

  // ----------------------------------------------------------------- sit ----
  (function sit() {
    const L = 1.6, N = 12;
    const b = {};
    const down = (t) => smooth(t / 0.45);
    b.root = { position: sample(L, N, (t) => [0, -6.2 * down(t), 0]) };
    b.body = { rotation: sample(L, N, (t) => [4.0 * down(t), 0, 0]) };
    b.head = rot(L, N, (t) => [-4.0 * down(t) + 1.2 * sin(t), 0, 2.0 * sin(t)]);
    HAIR.forEach((name, i) => { if (!has(name)) return;
      b[name] = rot(L, N, (t) => [-5.0 * down(t) + 2.0 * sin(t - i * 0.1), 0, 0]);
    });
    if (has('ahoge')) b.ahoge = rot(L, N, (t) => [-8.0 * down(t), 0, 3.0 * sin(t)]);
    ['leg_l', 'leg_r'].forEach((name) => { if (!has(name)) return;
      b[name] = rot(L, N, (t) => [-88.0 * down(t), 0, SIDE[name] * 12.0 * down(t)]);
    });
    ['arm_l', 'arm_r'].forEach((name) => { if (!has(name)) return;
      b[name] = rot(L, N, (t) => [-28.0 * down(t), 0, SIDE[name] * (16.0 * down(t) + 1.5)]);
    });
    FLOATERS.concat(BLOBS).forEach((name, i) => { if (!has(name)) return;
      b[name] = { position: sample(L, N, (t) => [0, 0.8 * sin(t - i * 0.08), 0]) };
    });
    anim.clip('sit', { length: L, loop: 'hold_on_last_frame', bones: b });
  })();

  notes.push(anim.clips.length + ' clips: ' + anim.clips.map((c) => c.name.split('.').pop()).join(', '));
  return { notes: notes };
}

module.exports = build;