'use strict';
// =====================================================================================
// ACID GEL SLIME — animations.  OWNER: lead (both delegated animators ran out of context).
// Contract: module.exports = function build(ctx) -> AnimationSet (tools/lib/model.js)
//   ctx.anim = AnimationSet bound to 'acid_gel_slime'; ctx.bones = every bone name in the rig.
// Units: rotation = degrees, position = MODEL UNITS (16 = 1 block), scale = multiplier.
// Signs (verified against the geometry): +X on gel_slime/body = lean BACK (front is -Z);
//   +X on lip = the grin's lower edge lifts; +X on jaw = lower mouth content drops;
//   +X on brow = tips up (-X = angry); on the LEFT arm negative Z raises it.
// Clips: idle 4s loop, move 1s loop, attack 1.25s, roar 1.6s, spawn 1.4s, death 1.2s.
// The grin stays shut except attack/roar (plus the deliberately slack mouth in death).
// gel_slime position y never goes below 0, so the puddle never sinks through the ground.
// =====================================================================================
const TAU = Math.PI * 2;
const r3 = (v) => v.map((x) => Math.round(x * 1000) / 1000);
const sin = (ph, a = 0) => Math.sin(TAU * ph + a);
const cos = (ph, a = 0) => Math.cos(TAU * ph + a);
const P = (t, v, e) => (e ? [t, v, e] : [t, v]);

module.exports = function build(ctx) {
  const { anim, bones } = ctx;
  const has = (n) => bones.indexOf(n) !== -1;
  const only = (o) => { const out = {}; for (const k of Object.keys(o)) if (has(k)) out[k] = o[k]; return out; };
  const mirror = (keys) => keys.map((k) => (k.length > 2 ? [k[0], [k[1][0], -k[1][1], -k[1][2]], k[2]] : [k[0], [k[1][0], -k[1][1], -k[1][2]]]));
  const lag = (keys, dt, amp = 1) => keys.map((k) => (k.length > 2 ? [k[0] + dt, k[1].map((v) => v * amp), k[2]] : [k[0] + dt, k[1].map((v) => v * amp)]));
  /** periodic sampler: keys at t = 0, step .. 4 with an exact phase lag; seamless by construction */
  function loop(cycles, lagS, f, step = 0.25) {
    const len = 4, n = Math.round(len / step), acc = {};
    for (let i = 0; i <= n; i++) {
      const t = Math.round(i * step * 1000) / 1000;
      const out = f(((t - lagS) / len) * cycles) || {};
      for (const ch of Object.keys(out)) (acc[ch] = acc[ch] || []).push([t, r3(out[ch])]);
    }
    for (const ch of Object.keys(acc)) acc[ch][acc[ch].length - 1] = [4, acc[ch][acc[ch].length - 1][1]];
    return acc;
  }
  /** mirror a chain of {rotation:[...]} samplers to the other side */
  function mirrorChain(c) { const out = {}; for (const k of Object.keys(c)) out[k] = { rotation: mirror(c[k].rotation) }; return out; }

  // ===================================================================================
  // 1. idle — 4 s loop: the body breathes, everything outside it lags behind
  // ===================================================================================
  {
    const UP = [0.986, 1.026, 0.986], DN = [1.03, 0.964, 1.03], REST = [1, 1, 1];
    const chain = (lagS, list) => {
      const out = {};
      for (const [bone, amp, extra] of list) out[bone] = loop(2, lagS + extra, (ph) => ({ rotation: [2.2 * amp * sin(ph, 0.9), 0, -8.0 * amp * (0.5 - 0.5 * cos(ph))] }));
      return out;
    };
    const bonesObj = Object.assign({
      gel_slime: {
        scale: [P(0, REST, 'easeInOutSine'), P(0.55, UP, 'easeInOutSine'), P(1.35, DN, 'easeInOutSine'),
                P(2.0, REST, 'easeInOutSine'), P(2.55, UP, 'easeInOutSine'), P(3.35, DN, 'easeInOutSine'), P(4, REST)],
        position: [P(0, [0, 0, 0], 'easeInOutSine'), P(0.55, [0, 0.16, 0], 'easeInOutSine'), P(1.35, [0, 0, 0], 'easeInOutSine'),
                   P(2.0, [0, 0, 0], 'easeInOutSine'), P(2.55, [0, 0.16, 0], 'easeInOutSine'), P(3.35, [0, 0, 0], 'easeInOutSine'), P(4, [0, 0, 0])],
      },
      body: loop(2, 0.22, (ph) => ({ rotation: [1.3 * sin(ph), 0, 2.0 * cos(ph)], scale: [1 + 0.006 * sin(ph, 3), 1 - 0.010 * sin(ph, 3), 1 + 0.006 * sin(ph, 3)] })),
      skirt: loop(2, 0.30, (ph) => ({ scale: [1 + 0.012 * sin(ph), 1 - 0.014 * sin(ph), 1 + 0.012 * sin(ph)], rotation: [0, 0, 0.8 * cos(ph)] })),
      dome: loop(2, 0.35, (ph) => ({ rotation: [0.9 * sin(ph, 0.5), 0, 1.1 * cos(ph, 0.5)] })),
      jelly_top: loop(2, 0.50, (ph) => ({ rotation: [1.9 * sin(ph, 0.3), 0, 3.6 * cos(ph, 0.3)], position: [0, 0.22 * sin(ph, 1.6), 0] })),
      face: loop(2, 0.30, (ph) => ({ rotation: [1.0 * sin(ph, 0.8), 0, 1.2 * cos(ph, 0.8)] })),
      lobe_front: loop(2, 0.12, (ph) => ({ rotation: [4.4 * (0.5 - 0.5 * cos(ph)), 0, 0] })),
      lobe_back: loop(2, 0.16, (ph) => ({ rotation: [-3.4 * (0.5 - 0.5 * cos(ph)), 0, 0] })),
      antenna_l: loop(2, 0.25, (ph) => ({ rotation: [3.4 * sin(ph, 0.7) + 1.5 * sin(2 * ph), 0, 7.0 * sin(ph)] })),
      antenna_r: loop(2, 0.42, (ph) => ({ rotation: [3.0 * sin(ph, 1.1) + 1.4 * sin(2 * ph), 0, -6.4 * sin(ph, 0.4)] })),
      bulb_l: loop(2, 0.62, (ph) => ({ rotation: [5.0 * sin(ph, 0.7), 0, 11.0 * sin(ph)], scale: [1 + 0.05 * sin(ph, 1.2), 1 + 0.05 * sin(ph, 1.2), 1 + 0.05 * sin(ph, 1.2)] })),
      bulb_r: loop(2, 0.82, (ph) => ({ rotation: [4.4 * sin(ph, 1.1), 0, -9.6 * sin(ph, 0.4)], scale: [1 + 0.05 * sin(ph, 1.7), 1 + 0.05 * sin(ph, 1.7), 1 + 0.05 * sin(ph, 1.7)] })),
      drip_f: loop(1, 0.0, (ph) => ({ scale: [1, 1 + 0.18 * (0.5 - 0.5 * cos(ph)), 1], rotation: [1.4 * sin(ph, 1.1), 0, 1.6 * cos(ph, 1.1)] }), 0.5),
      drip_l: loop(2, 0.30, (ph) => ({ scale: [1, 1 + 0.14 * (0.5 - 0.5 * cos(ph)), 1], rotation: [1.2 * sin(ph, 0.6), 0, 1.6 * cos(ph, 0.6)] })),
      drip_r: loop(1, 1.6, (ph) => ({ scale: [1, 1 + 0.20 * (0.5 - 0.5 * cos(ph)), 1], rotation: [1.4 * sin(ph, 2.0), 0, 1.2 * cos(ph, 2.0)] }), 0.5),
      bead_l: loop(2, 0.50, (ph) => ({ position: [0, 0.45 * sin(ph), 0], rotation: [0, 0, 6.0 * sin(ph, 0.9)], scale: [1 + 0.06 * sin(ph, 1.4), 1 + 0.06 * sin(ph, 1.4), 1 + 0.06 * sin(ph, 1.4)] })),
      bead_r: loop(2, 0.80, (ph) => ({ position: [0, 0.40 * sin(ph, 1.5), 0], rotation: [0, 0, -5.4 * sin(ph, 0.2)], scale: [1 + 0.05 * sin(ph, 2.1), 1 + 0.05 * sin(ph, 2.1), 1 + 0.05 * sin(ph, 2.1)] })),
      brow_l: loop(2, 0.18, (ph) => ({ rotation: [1.8 * sin(ph, 0.5), 0, -1.6 * cos(ph, 0.5)] })),
      brow_r: loop(2, 0.24, (ph) => ({ rotation: [1.8 * sin(ph, 0.5), 0, 1.6 * cos(ph, 0.5)] })),
      core: Object.assign(loop(2, 0.10, (ph) => ({ rotation: [0, 0, 3.4 * sin(ph, 0.4)] })), {
        scale: [P(0, REST), P(0.9, REST, 'easeOutQuad'), P(1.02, [1.09, 1.09, 1.09], 'easeInQuad'), P(1.25, REST),
                P(2.9, REST, 'easeOutQuad'), P(3.02, [1.09, 1.09, 1.09], 'easeInQuad'), P(3.25, REST), P(4, REST)],
      }),
    }, chain(0.10, [['lobe_l', 1, 0], ['lobe_l2', 0.65, 0.07], ['lobe_l3', 0.45, 0.11]]),
       mirrorChain(chain(0.14, [['lobe_r', 1, 0], ['lobe_r2', 0.65, 0.07], ['lobe_r3', 0.45, 0.11]])));
    const blink = { scale: [P(0, REST), P(1.42, REST, 'easeInQuad'), P(1.52, [1, 0.12, 1], 'easeOutQuad'), P(1.66, REST, 'easeOutBack'),
                             P(3.12, REST, 'easeInQuad'), P(3.22, [1, 0.12, 1], 'easeOutQuad'), P(3.36, REST, 'easeOutBack')],
                    position: [P(1.42, [0, 0, 0], 'easeInQuad'), P(1.52, [0, -0.35, 0], 'easeOutQuad'), P(1.66, [0, 0, 0], 'easeOutBack'),
                               P(3.12, [0, 0, 0], 'easeInQuad'), P(3.22, [0, -0.35, 0], 'easeOutQuad'), P(3.36, [0, 0, 0], 'easeOutBack')] };
    bonesObj.eye_l = blink; bonesObj.eye_r = blink;
    anim.clip('idle', { length: 4, loop: true, bones: only(bonesObj) });
  }

  // ===================================================================================
  // 2. move — 1 s loop: one hop (squash -> stretch -> splat -> settle)
  // ===================================================================================
  {
    const bonesObj = {
      gel_slime: {
        scale: [P(0, [1.10, 0.87, 1.10]), P(0.08, [1.14, 0.83, 1.14], 'easeOutQuad'), P(0.18, [0.90, 1.16, 0.90], 'easeInQuad'),
                P(0.30, [0.98, 1.05, 0.98], 'easeOutQuad'), P(0.44, [0.99, 1.02, 0.99], 'easeInQuad'), P(0.52, [1.18, 0.80, 1.18], 'easeOutQuad'),
                P(0.62, [0.96, 1.08, 0.96], 'easeOutBack'), P(0.78, [1.05, 0.96, 1.05], 'easeInOutQuad'), P(0.88, [1.01, 0.99, 1.01]), P(1, [1.10, 0.87, 1.10])],
        position: [P(0, [0, 0, 0]), P(0.18, [0, 0.35, 0], 'easeOutQuad'), P(0.30, [0, 2.5, 0], 'easeOutSine'), P(0.44, [0, 1.6, 0], 'easeInQuad'),
                   P(0.52, [0, 0, 0], 'easeInQuad'), P(0.62, [0, 0.25, 0], 'easeOutQuad'), P(0.78, [0, 0, 0]), P(1, [0, 0, 0])],
        rotation: [P(0, [0, 0, -1.2]), P(0.30, [0, 0, 1.4], 'easeInOutSine'), P(0.60, [0, 0, -1.0], 'easeInOutQuad'), P(1, [0, 0, -1.2])],
      },
      body: { scale: [P(0, [1.03, 0.95, 1.03]), P(0.22, [0.96, 1.06, 0.96], 'easeOutQuad'), P(0.60, [1.08, 0.90, 1.08], 'easeOutQuad'), P(0.72, [0.98, 1.03, 0.98], 'easeOutBack'), P(0.90, [1.01, 0.99, 1.01]), P(1, [1.03, 0.95, 1.03])],
              position: [P(0, [0, 0, 0]), P(0.28, [0, 0.3, 0], 'easeOutQuad'), P(0.60, [0, -0.15, 0], 'easeOutQuad'), P(0.82, [0, 0.05, 0]), P(1, [0, 0, 0])],
              rotation: [P(0, [0, 0, 0]), P(0.35, [-6, 0, 2], 'easeInOutQuad'), P(0.60, [5, 0, -2], 'easeOutQuad'), P(0.85, [-2, 0, 0]), P(1, [0, 0, 0])] },
      jelly_top: { rotation: [P(0, [0, 0, 0]), P(0.50, [7, 0, -5], 'easeInOutQuad'), P(0.70, [-5, 0, 4], 'easeOutQuad'), P(0.90, [2, 0, -1]), P(1, [0, 0, 0])] },
      skirt: { scale: [P(0, [1, 1, 1]), P(0.30, [0.93, 1.05, 0.93], 'easeOutQuad'), P(0.58, [1.16, 0.86, 1.16], 'easeOutQuad'), P(0.75, [0.98, 1.02, 0.98]), P(1, [1, 1, 1])] },
      core: { scale: [P(0, [1, 1, 1]), P(0.30, [0.95, 0.95, 0.95]), P(0.62, [1.12, 1.12, 1.12], 'easeOutQuad'), P(0.85, [1, 1, 1]), P(1, [1, 1, 1])] },
      face: { rotation: [P(0, [0, 0, 0]), P(0.35, [-3, 0, 0], 'easeInOutQuad'), P(0.62, [4, 0, 0], 'easeOutQuad'), P(1, [0, 0, 0])] },
      lobe_front: { rotation: [P(0, [0, 0, 0]), P(0.22, [6, 0, 0], 'easeOutQuad'), P(0.62, [-10, 0, 0], 'easeOutQuad'), P(0.82, [2, 0, 0]), P(1, [0, 0, 0])] },
      lobe_back: { rotation: [P(0, [0, 0, 0]), P(0.24, [-6, 0, 0], 'easeOutQuad'), P(0.64, [9, 0, 0], 'easeOutQuad'), P(1, [0, 0, 0])] },
      drip_f: { rotation: [P(0, [0, 0, 0]), P(0.20, [-12, 0, 0], 'easeOutQuad'), P(0.60, [14, 0, 0], 'easeOutQuad'), P(0.85, [-4, 0, 0]), P(1, [0, 0, 0])],
                scale: [P(0, [1, 1, 1]), P(0.30, [1, 0.9, 1]), P(0.60, [1, 1.25, 1], 'easeOutQuad'), P(0.90, [1, 1, 1]), P(1, [1, 1, 1])] },
      drip_l: { rotation: [P(0, [0, 0, 0]), P(0.24, [8, 0, -4], 'easeOutQuad'), P(0.64, [-10, 0, 3], 'easeOutQuad'), P(1, [0, 0, 0])] },
      drip_r: { rotation: [P(0, [0, 0, 0]), P(0.28, [-9, 0, 5], 'easeOutQuad'), P(0.68, [11, 0, -3], 'easeOutQuad'), P(1, [0, 0, 0])] },
      bead_l: { position: [P(0, [0, 0, 0]), P(0.35, [0, 0.5, 0], 'easeOutQuad'), P(0.62, [0, -0.3, 0], 'easeOutQuad'), P(1, [0, 0, 0])] },
      bead_r: { position: [P(0, [0, 0, 0]), P(0.40, [0, 0.45, 0], 'easeOutQuad'), P(0.66, [0, -0.25, 0], 'easeOutQuad'), P(1, [0, 0, 0])] },
      eye_l: { scale: [P(0, [1, 1, 1]), P(0.25, [0.96, 1.08, 0.96], 'easeOutQuad'), P(0.62, [1.08, 0.72, 1.08], 'easeOutQuad'), P(0.85, [1, 1, 1]), P(1, [1, 1, 1])] },
      brow_l: { rotation: [P(0, [0, 0, 0]), P(0.30, [4, 0, 0], 'easeOutQuad'), P(0.65, [-3, 0, 0], 'easeOutQuad'), P(1, [0, 0, 0])] },
    };
    bonesObj.eye_r = bonesObj.eye_l;
    bonesObj.brow_r = bonesObj.brow_l;
    const armL = [P(0, [0, 0, 0]), P(0.20, [-12, 0, -14], 'easeOutQuad'), P(0.50, [-8, 0, -6], 'easeInOutQuad'), P(0.62, [10, 0, -18], 'easeOutBack'), P(0.80, [-4, 0, -6], 'easeInOutQuad'), P(0.96, [2, 0, -2]), P(1, [0, 0, 0])];
    const antL = [P(0, [0, 0, 0]), P(0.20, [14, 0, 4], 'easeOutQuad'), P(0.34, [4, 0, 0], 'easeInOutQuad'), P(0.55, [-16, 0, -4], 'easeOutQuad'), P(0.72, [7, 0, 0], 'easeInOutSine'), P(0.88, [-3, 0, 0]), P(1, [0, 0, 0])];
    for (const side of [-1, 1]) {
      const s = side < 0 ? 'l' : 'r', m = side < 0 ? 1 : -1, dd = side < 0 ? 0 : 0.03;
      const rot = (keys, amp, off) => keys.map((k) => [k[0] + (off || 0), [k[1][0] * amp, k[1][1], k[1][2] * m * amp], k[2]]);
      bonesObj['lobe_' + s] = { rotation: rot(armL, 1, 0) };
      bonesObj['lobe_' + s + '2'] = { rotation: rot(armL, 0.6, dd) };
      bonesObj['lobe_' + s + '3'] = { rotation: rot(armL, 0.4, dd * 2) };
      bonesObj['antenna_' + s] = { rotation: rot(antL, 1, dd) };
      bonesObj['bulb_' + s] = { rotation: rot(antL, 1.4, dd * 2) };
    }
    anim.clip('move', { length: 1, loop: true, bones: only(bonesObj) });
  }

  // ===================================================================================
  // 3./4. the two clips that open the mouth (shared rig: lip lifts, jaw drops, maw pushes
  //       forward; the maw lags the lip so the cavity only surfaces once the lip has cleared)
  // ===================================================================================
  function mouthRig(b) {
    const o = b.open === undefined ? 30 : b.open, jr = b.jaw === undefined ? 14 : b.jaw;
    return {
      lip: { rotation: [P(0, [0, 0, 0]), P(b.crack, [0, 0, 0], 'easeOutQuad'), P(b.wide, [o * 0.7, 0, 0], 'easeOutBack'), P(b.mid, [o, 0, 0], 'easeOutQuad'),
                         P(b.prev, [o * 0.88, 0, 0], 'easeInOutSine'), P(b.snap, [o * 0.95, 0, 0], 'easeInQuad'), P(b.shut, [o * 0.08, 0, 0], 'easeOutQuad'),
                         P(b.seal, [-2.5, 0, 0], 'easeOutBack'), P(b.quiet, [0.5, 0, 0], 'easeInOutSine'), P(b.end, [0, 0, 0])] },
      jaw: { rotation: [P(0, [0, 0, 0]), P(b.crack, [0, 0, 0], 'easeOutQuad'), P(b.mid, [jr, 0, 0], 'easeOutBack'), P(b.snap, [jr * 0.94, 0, 0], 'easeInQuad'),
                        P(b.shut, [1, 0, 0], 'easeOutQuad'), P(b.seal, [-1.5, 0, 0], 'easeOutBack'), P(b.end, [0, 0, 0])],
             position: [P(0, [0, 0, 0]), P(b.crack, [0, 0, 0], 'easeOutQuad'), P(b.mid, [0, -0.55, 0], 'easeOutBack'), P(b.snap, [0, -0.5, 0], 'easeInQuad'),
                        P(b.shut, [0, 0, 0], 'easeOutQuad'), P(b.end, [0, 0, 0])] },
      maw: { scale: [P(0, [1, 1, 1]), P(b.crack + 0.04, [1, 1, 1]), P(b.mid + 0.04, [1.05, 1.10, 1.03], 'easeOutQuad'), P(b.quiet, [1, 1, 1], 'easeOutQuad'), P(b.end, [1, 1, 1])],
             position: [P(0, [0, 0, 0]), P(b.crack + 0.04, [0, 0, 0]), P(b.mid + 0.08, [0, 0, -0.55], 'easeOutQuad'), P(b.quiet, [0, 0, -0.2], 'easeInQuad'), P(b.end, [0, 0, 0])] },
      mouth: { position: [P(0, [0, 0, 0]), P(b.crack, [0, 0, 0]), P(b.mid, [0, 0, -0.25], 'easeOutQuad'), P(b.shut, [0, 0, -0.25], 'easeInQuad'), P(b.seal, [0, 0, 0], 'easeOutQuad'), P(b.end, [0, 0, 0])] },
    };
  }

  // ---- attack: coil back, lunge, bite, snap shut, recover
  {
    const bonesObj = Object.assign({
      gel_slime: {
        rotation: [P(0, [0, 0, 0]), P(0.28, [5, 0, 0], 'easeInQuad'), P(0.40, [-7, 0, 0], 'easeOutQuad'), P(0.50, [-4, 0, 0], 'easeOutQuad'),
                   P(0.72, [2.5, 0, 0], 'easeOutQuad'), P(0.88, [-0.8, 0, 0]), P(1.05, [0.3, 0, 0]), P(1.25, [0, 0, 0])],
        position: [P(0, [0, 0, 0]), P(0.10, [0, -0.15, 0], 'easeOutQuad'), P(0.28, [0, 0.3, 1.4], 'easeInQuad'), P(0.40, [0, 1.3, -2.8], 'easeOutQuad'),
                   P(0.50, [0, 1.5, -2.4], 'easeOutQuad'), P(0.58, [0, 1.4, -1.6], 'easeOutQuad'), P(0.72, [0, 0, -0.6], 'easeInOutQuad'), P(0.88, [0, 0, 0.15], 'easeOutQuad'), P(1.25, [0, 0, 0])],
        scale: [P(0, [1, 1, 1]), P(0.10, [1.03, 0.95, 1.03], 'easeOutQuad'), P(0.28, [1.07, 0.92, 1.07], 'easeInQuad'), P(0.40, [0.93, 1.12, 0.93], 'easeOutQuad'),
                P(0.50, [1.15, 0.85, 1.15], 'easeOutQuad'), P(0.58, [0.97, 1.06, 0.97], 'easeOutBack'), P(0.72, [1.04, 0.96, 1.04], 'easeInOutQuad'),
                P(0.88, [0.99, 1.01, 0.99]), P(1.05, [1.005, 0.995, 1.005]), P(1.25, [1, 1, 1])],
      },
      body: { rotation: [P(0, [0, 0, 0]), P(0.28, [5, 0, 0], 'easeInQuad'), P(0.46, [-7, 0, 0], 'easeOutQuad'), P(0.60, [4, 0, 0], 'easeOutQuad'), P(0.80, [-2, 0, 0]), P(1.05, [0, 0, 0]), P(1.25, [0, 0, 0])],
              scale: [P(0, [1, 1, 1]), P(0.28, [1.04, 0.95, 1.04], 'easeInQuad'), P(0.50, [1.08, 0.91, 1.08], 'easeOutQuad'), P(0.68, [0.98, 1.03, 0.98], 'easeOutBack'), P(0.90, [1.01, 0.99, 1.01]), P(1.25, [1, 1, 1])] },
      jelly_top: { rotation: [P(0, [0, 0, 0]), P(0.30, [7, 0, 0], 'easeInQuad'), P(0.44, [-12, 0, 0], 'easeOutQuad'), P(0.58, [10, 0, 0], 'easeOutQuad'), P(0.75, [-4, 0, 0], 'easeInOutQuad'), P(1.05, [0, 0, 0]), P(1.25, [0, 0, 0])] },
      skirt: { scale: [P(0, [1, 1, 1]), P(0.30, [1.05, 0.95, 1.05], 'easeOutQuad'), P(0.52, [1.14, 0.88, 1.14], 'easeOutQuad'), P(0.70, [0.98, 1.02, 0.98], 'easeOutBack'), P(1.25, [1, 1, 1])] },
      crystals: { rotation: [P(0, [0, 0, 0]), P(0.28, [-6, 0, 0], 'easeInQuad'), P(0.50, [-13, 0, 0], 'easeOutQuad'), P(0.80, [-3, 0, 0], 'easeInOutQuad'), P(1.05, [0, 0, 0]), P(1.25, [0, 0, 0])] },
      core: { scale: [P(0, [1, 1, 1]), P(0.28, [0.95, 0.95, 0.95]), P(0.50, [1.25, 1.25, 1.25], 'easeOutQuad'), P(0.72, [1.1, 1.1, 1.1], 'easeInOutQuad'), P(1.0, [1, 1, 1]), P(1.25, [1, 1, 1])] },
      face: { rotation: [P(0, [0, 0, 0]), P(0.30, [4, 0, 0], 'easeInQuad'), P(0.50, [-6, 0, 0], 'easeOutQuad'), P(0.72, [3, 0, 0], 'easeOutQuad'), P(1.05, [0, 0, 0]), P(1.25, [0, 0, 0])] },
      eye_l: { scale: [P(0, [1, 1, 1]), P(0.28, [1.05, 0.62, 1.05], 'easeOutQuad'), P(0.72, [1.05, 0.62, 1.05], 'easeInOutQuad'), P(0.92, [1, 1, 1], 'easeOutQuad'), P(1.25, [1, 1, 1])] },
      brow_l: { rotation: [P(0, [0, 0, 0]), P(0.18, [-9, 0, -3], 'easeOutBack'), P(0.74, [-9, 0, -3]), P(0.94, [0, 0, 0], 'easeOutQuad'), P(1.25, [0, 0, 0])] },
      lobe_front: { rotation: [P(0, [0, 0, 0]), P(0.3, [5, 0, 0], 'easeOutQuad'), P(0.55, [8, 0, 0], 'easeOutQuad'), P(0.85, [3, 0, 0], 'easeInOutQuad'), P(1.25, [0, 0, 0])] },
      lobe_back: { rotation: [P(0, [0, 0, 0]), P(0.3, [-4, 0, 0], 'easeOutQuad'), P(0.55, [8, 0, 0], 'easeOutQuad'), P(0.85, [-2, 0, 0]), P(1.25, [0, 0, 0])] },
      drip_f: { rotation: [P(0, [0, 0, 0]), P(0.30, [14, 0, 0], 'easeInQuad'), P(0.55, [-18, 0, 0], 'easeOutQuad'), P(0.80, [6, 0, 0], 'easeInOutQuad'), P(1.25, [0, 0, 0])] },
      drip_l: { rotation: [P(0, [0, 0, 0]), P(0.34, [-12, 0, -6], 'easeOutQuad'), P(0.60, [10, 0, 4], 'easeOutQuad'), P(1.25, [0, 0, 0])] },
      drip_r: { rotation: [P(0, [0, 0, 0]), P(0.34, [-10, 0, 7], 'easeOutQuad'), P(0.62, [12, 0, -5], 'easeOutQuad'), P(1.25, [0, 0, 0])] },
      bead_l: { position: [P(0, [0, 0, 0]), P(0.40, [0, 0.4, 0], 'easeOutQuad'), P(0.75, [0, -0.3, 0], 'easeOutQuad'), P(1.25, [0, 0, 0])] },
      bead_r: { position: [P(0, [0, 0, 0]), P(0.45, [0, 0.35, 0], 'easeOutQuad'), P(0.80, [0, -0.25, 0], 'easeOutQuad'), P(1.25, [0, 0, 0])] },
    }, mouthRig({ crack: 0.30, wide: 0.46, mid: 0.56, prev: 0.64, snap: 0.74, shut: 0.80, seal: 0.86, quiet: 0.98, end: 1.12, open: 27, jaw: 13 }));
    bonesObj.eye_r = bonesObj.eye_l;
    bonesObj.brow_r = { rotation: [P(0, [0, 0, 0]), P(0.18, [-9, 0, 3], 'easeOutBack'), P(0.74, [-9, 0, 3]), P(0.94, [0, 0, 0], 'easeOutQuad'), P(1.25, [0, 0, 0])] };
    const armA = [P(0, [0, 0, 0]), P(0.28, [-16, 0, -12], 'easeInQuad'), P(0.44, [10, 0, -20], 'easeOutQuad'), P(0.55, [13, 0, -26], 'easeOutBack'), P(0.72, [-6, 0, -8], 'easeInOutQuad'), P(1.0, [2, 0, -2]), P(1.25, [0, 0, 0])];
    const antA = [P(0, [0, 0, 0]), P(0.28, [-10, 0, 6], 'easeInQuad'), P(0.44, [16, 0, -8], 'easeOutQuad'), P(0.58, [-12, 0, 4], 'easeOutQuad'), P(0.78, [5, 0, -2], 'easeInOutSine'), P(1.25, [0, 0, 0])];
    for (const side of [-1, 1]) {
      const s = side < 0 ? 'l' : 'r', m = side < 0 ? 1 : -1, dd = side < 0 ? 0 : 0.03;
      const rot = (keys, amp, off) => keys.map((k) => [k[0] + (off || 0), [k[1][0] * amp, k[1][1], k[1][2] * m * amp], k[2]]);
      bonesObj['lobe_' + s] = { rotation: rot(armA, 1, 0) };
      bonesObj['lobe_' + s + '2'] = { rotation: rot(armA, 0.6, dd) };
      bonesObj['lobe_' + s + '3'] = { rotation: rot(armA, 0.4, dd * 2) };
      bonesObj['antenna_' + s] = { rotation: rot(antA, 1, dd) };
      bonesObj['bulb_' + s] = { rotation: rot(antA, 1.35, dd * 2) };
    }
    bonesObj.crystal_1 = { rotation: [P(0, [0, 0, 0]), P(0.50, [0, 0, 9], 'easeOutQuad'), P(1.05, [0, 0, 0], 'easeInOutQuad'), P(1.25, [0, 0, 0])] };
    bonesObj.crystal_2 = { rotation: [P(0, [0, 0, 0]), P(0.50, [-7, 0, 0], 'easeOutQuad'), P(1.05, [0, 0, 0], 'easeInOutQuad'), P(1.25, [0, 0, 0])] };
    bonesObj.crystal_3 = { rotation: [P(0, [0, 0, 0]), P(0.50, [0, 0, -9], 'easeOutQuad'), P(1.05, [0, 0, 0], 'easeInOutQuad'), P(1.25, [0, 0, 0])] };
    bonesObj.crystal_4 = { rotation: [P(0, [0, 0, 0]), P(0.52, [6, 0, 0], 'easeOutQuad'), P(1.05, [0, 0, 0], 'easeInOutQuad'), P(1.25, [0, 0, 0])] };
    bonesObj.crystal_5 = { rotation: [P(0, [0, 0, 0]), P(0.48, [0, 0, -8], 'easeOutQuad'), P(1.05, [0, 0, 0], 'easeInOutQuad'), P(1.25, [0, 0, 0])] };
    anim.clip('attack', { length: 1.25, loop: false, bones: only(bonesObj) });
  }

  // ---- roar: rise and swell, hold the maw wide open with a tremble, snap shut, settle
  {
    const bonesObj = Object.assign({
      gel_slime: {
        position: [P(0, [0, 0, 0]), P(0.20, [0, -0.25, 0], 'easeInOutSine'), P(0.42, [0, 1.5, 0], 'easeOutQuad'), P(0.55, [0, 1.9, 0], 'easeOutSine'),
                   P(0.70, [0, 1.9, 0], 'easeInOutSine'), P(0.78, [0, 1.75, 0], 'easeInOutSine'), P(0.86, [0, 1.9, 0], 'easeInOutSine'), P(0.94, [0, 1.75, 0], 'easeInOutSine'),
                   P(1.05, [0, 1.8, 0], 'easeInOutSine'), P(1.25, [0, 0.3, 0], 'easeInQuad'), P(1.38, [0, 0.05, 0], 'easeOutQuad'), P(1.6, [0, 0, 0])],
        scale: [P(0, [1, 1, 1]), P(0.20, [1.05, 0.93, 1.05], 'easeInOutSine'), P(0.42, [0.93, 1.13, 0.93], 'easeOutQuad'), P(0.55, [0.95, 1.10, 0.95], 'easeOutSine'),
                P(0.72, [1.02, 1.00, 1.02], 'easeInOutSine'), P(0.80, [0.95, 1.10, 0.95], 'easeInOutSine'), P(0.88, [1.02, 1.00, 1.02], 'easeInOutSine'), P(0.96, [0.96, 1.08, 0.96], 'easeInOutSine'),
                P(1.05, [0.97, 1.06, 0.97], 'easeInOutSine'), P(1.25, [1.08, 0.90, 1.08], 'easeInQuad'), P(1.38, [0.97, 1.04, 0.97], 'easeOutBack'), P(1.48, [1.01, 0.99, 1.01]), P(1.6, [1, 1, 1])],
        rotation: [P(0, [0, 0, 0]), P(0.20, [4, 0, 0], 'easeInOutSine'), P(0.42, [-3, 0, 0], 'easeOutQuad'), P(0.55, [7, 0, 0], 'easeOutBack'), P(1.05, [7, 0, 0]), P(1.30, [0, 0, 0], 'easeInQuad'), P(1.6, [0, 0, 0])],
      },
      body: { rotation: [P(0, [0, 0, 0]), P(0.20, [4, 0, 0], 'easeInOutSine'), P(0.55, [-6, 0, 0], 'easeOutQuad'), P(1.05, [-6, 0, 0]), P(1.32, [2, 0, 0], 'easeOutQuad'), P(1.6, [0, 0, 0])],
              scale: [P(0, [1, 1, 1]), P(0.55, [0.97, 1.05, 0.97], 'easeOutQuad'), P(1.25, [1.06, 0.93, 1.06], 'easeInQuad'), P(1.42, [0.99, 1.01, 0.99]), P(1.6, [1, 1, 1])] },
      jelly_top: { rotation: [P(0, [0, 0, 0]), P(0.20, [6, 0, 0], 'easeInOutSine'), P(0.55, [-5, 0, 0], 'easeOutQuad'), P(1.05, [-5, 0, 0]), P(1.30, [3, 0, 0], 'easeOutQuad'), P(1.6, [0, 0, 0])] },
      skirt: { scale: [P(0, [1, 1, 1]), P(0.20, [1.06, 0.94, 1.06], 'easeOutQuad'), P(0.45, [0.92, 1.06, 0.92], 'easeOutQuad'), P(1.25, [1.12, 0.88, 1.12], 'easeInQuad'), P(1.45, [0.99, 1.01, 0.99]), P(1.6, [1, 1, 1])] },
      crystals: { rotation: [P(0, [0, 0, 0]), P(0.30, [4, 0, 0], 'easeOutQuad'), P(0.60, [-14, 0, 0], 'easeOutBack'), P(1.05, [-14, 0, 0]), P(1.35, [-2, 0, 0], 'easeInOutQuad'), P(1.6, [0, 0, 0])] },
      core: { scale: [P(0, [1, 1, 1]), P(0.30, [0.9, 0.9, 0.9]), P(0.65, [1.3, 1.3, 1.3], 'easeOutQuad'), P(1.05, [1.25, 1.25, 1.25]), P(1.35, [1, 1, 1], 'easeInOutQuad'), P(1.6, [1, 1, 1])] },
      face: { rotation: [P(0, [0, 0, 0]), P(0.25, [3, 0, 0], 'easeInOutSine'), P(0.55, [-8, 0, 0], 'easeOutBack'), P(1.05, [-8, 0, 0]), P(1.30, [2, 0, 0], 'easeOutQuad'), P(1.6, [0, 0, 0])] },
      eye_l: { scale: [P(0, [1, 1, 1]), P(0.25, [1, 0.8, 1], 'easeOutQuad'), P(0.55, [1.10, 1.20, 1.10], 'easeOutBack'), P(1.05, [1.10, 1.20, 1.10]), P(1.30, [1, 1, 1], 'easeOutQuad'), P(1.6, [1, 1, 1])] },
      brow_l: { rotation: [P(0, [0, 0, 0]), P(0.35, [-11, 0, -3], 'easeOutBack'), P(1.10, [-11, 0, -3]), P(1.35, [0, 0, 0], 'easeOutQuad'), P(1.6, [0, 0, 0])] },
      brow_r: { rotation: [P(0, [0, 0, 0]), P(0.37, [-11, 0, 3], 'easeOutBack'), P(1.10, [-11, 0, 3]), P(1.35, [0, 0, 0], 'easeOutQuad'), P(1.6, [0, 0, 0])] },
      lobe_front: { rotation: [P(0, [0, 0, 0]), P(0.30, [5, 0, 0], 'easeOutQuad'), P(0.60, [-9, 0, 0], 'easeOutQuad'), P(1.05, [-9, 0, 0]), P(1.35, [3, 0, 0], 'easeInOutQuad'), P(1.6, [0, 0, 0])] },
      lobe_back: { rotation: [P(0, [0, 0, 0]), P(0.30, [-4, 0, 0], 'easeOutQuad'), P(0.60, [7, 0, 0], 'easeOutQuad'), P(1.05, [7, 0, 0]), P(1.35, [-2, 0, 0]), P(1.6, [0, 0, 0])] },
      drip_f: { rotation: [P(0, [0, 0, 0]), P(0.30, [-10, 0, 0], 'easeOutQuad'), P(0.70, [12, 0, 0], 'easeOutQuad'), P(1.05, [14, 0, 0]), P(1.40, [-4, 0, 0], 'easeInOutQuad'), P(1.6, [0, 0, 0])],
                scale: [P(0, [1, 1, 1]), P(0.70, [1, 1.20, 1], 'easeOutQuad'), P(1.10, [1, 1.22, 1]), P(1.45, [1, 1, 1], 'easeInOutQuad'), P(1.6, [1, 1, 1])] },
      drip_l: { rotation: [P(0, [0, 0, 0]), P(0.35, [8, 0, -5], 'easeOutQuad'), P(0.72, [-10, 0, 4], 'easeOutQuad'), P(1.05, [-11, 0, 4]), P(1.6, [0, 0, 0])] },
      drip_r: { rotation: [P(0, [0, 0, 0]), P(0.38, [7, 0, 6], 'easeOutQuad'), P(0.75, [-9, 0, -4], 'easeOutQuad'), P(1.05, [-10, 0, -5]), P(1.6, [0, 0, 0])] },
      bead_l: { position: [P(0, [0, 0, 0]), P(0.55, [0, 0.6, 0], 'easeOutBack'), P(1.05, [0, 0.55, 0]), P(1.40, [0, -0.2, 0], 'easeOutQuad'), P(1.6, [0, 0, 0])] },
      bead_r: { position: [P(0, [0, 0, 0]), P(0.60, [0, 0.55, 0], 'easeOutBack'), P(1.05, [0, 0.5, 0]), P(1.45, [0, -0.15, 0], 'easeOutQuad'), P(1.6, [0, 0, 0])] },
    }, mouthRig({ crack: 0.40, wide: 0.62, mid: 0.70, prev: 0.82, snap: 1.10, shut: 1.20, seal: 1.26, quiet: 1.38, end: 1.45, open: 32, jaw: 15 }));
    bonesObj.eye_r = bonesObj.eye_l;
    const armR = [P(0, [0, 0, 0]), P(0.25, [-10, 0, -8], 'easeOutQuad'), P(0.60, [5, 0, -22], 'easeOutBack'), P(1.05, [5, 0, -22]), P(1.35, [-4, 0, -6], 'easeInOutQuad'), P(1.6, [0, 0, 0])];
    const antR = [P(0, [0, 0, 0]), P(0.25, [-8, 0, 0], 'easeOutQuad'), P(0.55, [18, 0, -12], 'easeOutBack'), P(0.75, [15, 0, -8], 'easeInOutSine'), P(0.95, [18, 0, -10], 'easeInOutSine'), P(1.10, [14, 0, -6]), P(1.40, [-4, 0, 2], 'easeInOutQuad'), P(1.6, [0, 0, 0])];
    for (const side of [-1, 1]) {
      const s = side < 0 ? 'l' : 'r', m = side < 0 ? 1 : -1, dd = side < 0 ? 0 : 0.03;
      const rot = (keys, amp, off) => keys.map((k) => [k[0] + (off || 0), [k[1][0] * amp, k[1][1], k[1][2] * m * amp], k[2]]);
      bonesObj['lobe_' + s] = { rotation: rot(armR, 1, 0) };
      bonesObj['lobe_' + s + '2'] = { rotation: rot(armR, 0.62, dd) };
      bonesObj['lobe_' + s + '3'] = { rotation: rot(armR, 0.42, dd * 2) };
      bonesObj['antenna_' + s] = { rotation: rot(antR, 1, dd) };
      bonesObj['bulb_' + s] = { rotation: rot(antR, 1.3, dd * 2), scale: [P(0, [1, 1, 1]), P(0.60, [1.25, 1.25, 1.25], 'easeOutBack'), P(1.10, [1.25, 1.25, 1.25]), P(1.40, [1, 1, 1], 'easeInOutQuad'), P(1.6, [1, 1, 1])] };
    }
    anim.clip('roar', { length: 1.6, loop: false, bones: only(bonesObj) });
  }

  // ===================================================================================
  // 5. spawn — from a flat puddle: rise with an overshoot, then wobble down to rest
  // ===================================================================================
  {
    const bonesObj = {
      gel_slime: {
        scale: [P(0, [1.35, 0.15, 1.35]), P(0.10, [1.30, 0.22, 1.30], 'easeOutQuad'), P(0.45, [0.86, 1.28, 0.86], 'easeOutBack'),
                P(0.60, [1.14, 0.85, 1.14], 'easeOutQuad'), P(0.75, [0.94, 1.09, 0.94], 'easeOutQuad'), P(0.90, [1.06, 0.95, 1.06], 'easeInOutSine'),
                P(1.05, [0.98, 1.02, 0.98], 'easeInOutSine'), P(1.18, [1.012, 0.99, 1.012], 'easeInOutSine'), P(1.30, [0.997, 1.002, 0.997], 'easeInOutSine'), P(1.4, [1, 1, 1])],
        position: [P(0, [0, 0, 0]), P(0.45, [0, 0.5, 0], 'easeOutQuad'), P(0.60, [0, 0, 0], 'easeInQuad'), P(0.75, [0, 0.22, 0], 'easeOutQuad'), P(0.90, [0, 0, 0], 'easeInOutSine'), P(1.4, [0, 0, 0])],
        rotation: [P(0, [0, 0, -3], 'easeInOutSine'), P(0.45, [0, 0, 2.5], 'easeOutQuad'), P(0.70, [0, 0, -1.5], 'easeInOutSine'), P(1.0, [0, 0, 0.6]), P(1.4, [0, 0, 0])],
      },
      body: { scale: [P(0, [0.92, 0.90, 0.92]), P(0.55, [1.06, 0.94, 1.06], 'easeOutQuad'), P(0.75, [0.97, 1.04, 0.97], 'easeInOutSine'), P(0.95, [1.02, 0.99, 1.02], 'easeInOutSine'), P(1.20, [1, 1, 1]), P(1.4, [1, 1, 1])],
              rotation: [P(0, [0, 0, 0]), P(0.55, [-4, 0, 2], 'easeOutQuad'), P(0.85, [3, 0, -1.5], 'easeInOutSine'), P(1.15, [-1, 0, 0.5]), P(1.4, [0, 0, 0])] },
      jelly_top: { rotation: [P(0, [0, 0, 0]), P(0.60, [7, 0, -4], 'easeOutQuad'), P(0.85, [-5, 0, 3], 'easeInOutSine'), P(1.10, [2, 0, -1]), P(1.4, [0, 0, 0])] },
      skirt: { scale: [P(0, [1.20, 0.70, 1.20]), P(0.50, [0.95, 1.06, 0.95], 'easeOutQuad'), P(0.80, [1.04, 0.97, 1.04], 'easeInOutSine'), P(1.05, [0.99, 1.01, 0.99]), P(1.4, [1, 1, 1])] },
      core: { scale: [P(0, [0.60, 0.30, 0.60]), P(0.50, [1.15, 1.15, 1.15], 'easeOutBack'), P(0.72, [1, 1, 1], 'easeInOutSine'), P(1.0, [1.06, 1.06, 1.06], 'easeInOutSine'), P(1.4, [1, 1, 1])] },
      crystals: { rotation: [P(0, [5, 0, -2]), P(0.60, [-4, 0, 1], 'easeOutQuad'), P(0.95, [1.5, 0, 0], 'easeInOutSine'), P(1.4, [0, 0, 0])] },
      face: { rotation: [P(0, [4, 0, 0]), P(0.60, [-3, 0, 0], 'easeOutQuad'), P(1.0, [1, 0, 0], 'easeInOutSine'), P(1.4, [0, 0, 0])] },
      eye_l: { scale: [P(0, [1.35, 0.18, 1.35]), P(0.42, [1.20, 0.30, 1.20], 'easeOutQuad'), P(0.58, [0.94, 1.16, 0.94], 'easeOutBack'), P(0.85, [1, 1, 1], 'easeInOutSine'), P(1.4, [1, 1, 1])],
               position: [P(0, [0, -0.6, 0]), P(0.50, [0, 0.1, 0], 'easeOutQuad'), P(0.85, [0, 0, 0], 'easeInOutSine'), P(1.4, [0, 0, 0])] },
      brow_l: { rotation: [P(0, [0, 0, 0]), P(0.55, [5, 0, 0], 'easeOutBack'), P(0.95, [-1, 0, 0], 'easeInOutSine'), P(1.4, [0, 0, 0])] },
      lobe_front: { rotation: [P(0, [6, 0, 0]), P(0.50, [-9, 0, 0], 'easeOutQuad'), P(0.85, [3, 0, 0], 'easeInOutSine'), P(1.4, [0, 0, 0])] },
      lobe_back: { rotation: [P(0, [-5, 0, 0]), P(0.55, [8, 0, 0], 'easeOutQuad'), P(0.90, [-2, 0, 0], 'easeInOutSine'), P(1.4, [0, 0, 0])] },
      drip_f: { scale: [P(0, [1, 0.55, 1]), P(0.62, [1, 1.22, 1], 'easeOutQuad'), P(1.0, [1, 1, 1], 'easeInOutSine'), P(1.4, [1, 1, 1])],
                rotation: [P(0, [-8, 0, 0]), P(0.60, [10, 0, 0], 'easeOutQuad'), P(1.0, [-3, 0, 0], 'easeInOutSine'), P(1.4, [0, 0, 0])] },
      drip_l: { scale: [P(0, [1, 0.50, 1]), P(0.68, [1, 1.18, 1], 'easeOutQuad'), P(1.05, [1, 1, 1], 'easeInOutSine'), P(1.4, [1, 1, 1])] },
      drip_r: { scale: [P(0, [1, 0.60, 1]), P(0.72, [1, 1.20, 1], 'easeOutQuad'), P(1.10, [1, 1, 1], 'easeInOutSine'), P(1.4, [1, 1, 1])] },
      bead_l: { position: [P(0, [0, -1.2, 0]), P(0.70, [0, 0.5, 0], 'easeOutBack'), P(1.05, [0, -0.2, 0], 'easeInOutSine'), P(1.4, [0, 0, 0])] },
      bead_r: { position: [P(0, [0, -1.1, 0]), P(0.75, [0, 0.45, 0], 'easeOutBack'), P(1.10, [0, -0.15, 0], 'easeInOutSine'), P(1.4, [0, 0, 0])] },
    };
    bonesObj.eye_r = bonesObj.eye_l;
    bonesObj.brow_r = bonesObj.brow_l;
    const armS = [P(0, [0, 0, -18]), P(0.35, [-6, 0, -14], 'easeOutQuad'), P(0.68, [5, 0, -24], 'easeOutBack'), P(0.90, [-3, 0, -7], 'easeInOutSine'), P(1.15, [1, 0, -2]), P(1.4, [0, 0, 0])];
    const antS = [P(0, [20, 0, 0]), P(0.40, [14, 0, -4], 'easeOutQuad'), P(0.75, [-8, 0, 3], 'easeOutBack'), P(1.0, [4, 0, -1], 'easeInOutSine'), P(1.4, [0, 0, 0])];
    for (const side of [-1, 1]) {
      const s = side < 0 ? 'l' : 'r', m = side < 0 ? 1 : -1, dd = side < 0 ? 0 : 0.04;
      const rot = (keys, amp, off) => keys.map((k) => [k[0] + (off || 0), [k[1][0] * amp, k[1][1], k[1][2] * m * amp], k[2]]);
      bonesObj['lobe_' + s] = { rotation: rot(armS, 1, 0) };
      bonesObj['lobe_' + s + '2'] = { rotation: rot(armS, 0.65, dd) };
      bonesObj['lobe_' + s + '3'] = { rotation: rot(armS, 0.45, dd * 2) };
      bonesObj['antenna_' + s] = { rotation: rot(antS, 1, dd) };
      bonesObj['bulb_' + s] = { rotation: rot(antS, 1.3, dd * 2), scale: [P(0, [0.7, 0.7, 0.7]), P(0.60, [1.2, 1.2, 1.2], 'easeOutBack'), P(1.0, [1, 1, 1], 'easeInOutSine'), P(1.4, [1, 1, 1])] };
    }
    anim.clip('spawn', { length: 1.4, loop: false, bones: only(bonesObj) });
  }

  // ===================================================================================
  // 6. death — collapses into a spreading puddle and STAYS there (last key = final pose)
  // ===================================================================================
  {
    const bonesObj = {
      gel_slime: {
        scale: [P(0, [1, 1, 1]), P(0.10, [0.95, 1.09, 0.95], 'easeOutQuad'), P(0.22, [1.06, 0.90, 1.06], 'easeInQuad'), P(0.40, [1.12, 0.72, 1.12], 'easeInOutQuad'),
                P(0.62, [1.22, 0.48, 1.22], 'easeInQuad'), P(0.82, [1.30, 0.28, 1.30], 'easeOutQuad'), P(1.05, [1.345, 0.215, 1.345], 'easeInOutQuad'), P(1.20, [1.35, 0.20, 1.35])],
        rotation: [P(0, [0, 0, 0]), P(0.22, [0, 0, -4], 'easeInQuad'), P(0.40, [3, 0, 5], 'easeInOutQuad'), P(0.62, [2, 0, 3.5], 'easeInOutQuad'), P(0.82, [2.5, 0, 4.5], 'easeOutQuad'), P(1.20, [3, 0, 5], 'easeInOutQuad')],
        position: [P(0, [0, 0, 0]), P(0.10, [0, 0.3, 0], 'easeOutQuad'), P(0.22, [0, 0, 0], 'easeInQuad'), P(0.62, [0, 0.35, 0], 'easeOutQuad'), P(1.20, [0, 0.4, 0])],
      },
      body: { scale: [P(0, [1, 1, 1]), P(0.10, [0.97, 1.05, 0.97], 'easeOutQuad'), P(0.40, [1.06, 0.85, 1.06], 'easeInOutQuad'), P(0.82, [1.12, 0.78, 1.12], 'easeOutQuad'), P(1.20, [1.14, 0.76, 1.14])],
              rotation: [P(0, [0, 0, 0]), P(0.40, [-4, 0, -6], 'easeInOutQuad'), P(0.80, [-2, 0, -4], 'easeOutQuad'), P(1.20, [-1, 0, -3])] },
      jelly_top: { rotation: [P(0, [0, 0, 0]), P(0.30, [-6, 0, 4], 'easeOutQuad'), P(0.62, [-18, 0, -8], 'easeInOutQuad'), P(0.95, [-22, 0, -10], 'easeOutQuad'), P(1.20, [-24, 0, -11])] },
      skirt: { scale: [P(0, [1, 1, 1]), P(0.40, [1.06, 0.88, 1.06], 'easeInOutQuad'), P(1.20, [1.15, 0.85, 1.15], 'easeOutQuad')] },
      core: { scale: [P(0, [1, 1, 1]), P(0.40, [0.85, 0.85, 0.85], 'easeOutQuad'), P(0.70, [0.70, 0.70, 0.70], 'easeInOutQuad'), P(1.20, [0.62, 0.62, 0.62], 'easeOutQuad')] },
      crystals: { rotation: [P(0, [0, 0, 0]), P(0.50, [4, 0, 2], 'easeOutQuad'), P(0.85, [9, 0, 4], 'easeInOutQuad'), P(1.20, [10, 0, 5])] },
      face: { rotation: [P(0, [0, 0, 0]), P(0.35, [-5, 0, 0], 'easeOutQuad'), P(0.75, [8, 0, 0], 'easeInOutQuad'), P(1.20, [11, 0, 0])] },
      lip: { rotation: [P(0, [0, 0, 0]), P(0.45, [2, 0, 0], 'easeOutQuad'), P(0.75, [8, 0, 0], 'easeInOutQuad'), P(1.20, [11, 0, 0])] },
      jaw: { rotation: [P(0, [0, 0, 0]), P(0.45, [1, 0, 0]), P(0.75, [5, 0, 0], 'easeInOutQuad'), P(1.20, [7, 0, 0])],
             position: [P(0, [0, 0, 0]), P(0.45, [0, -0.1, 0]), P(1.20, [0, -0.35, 0])] },
      eye_l: { scale: [P(0, [1, 1, 1]), P(0.10, [1, 1.20, 1], 'easeOutQuad'), P(0.40, [1.10, 0.80, 1.10], 'easeInOutQuad'), P(0.62, [1.35, 0.16, 1.35], 'easeOutQuad'), P(1.20, [1.40, 0.12, 1.40])],
               position: [P(0, [0, 0, 0]), P(0.62, [0, -0.4, 0], 'easeOutQuad'), P(1.20, [0, -0.55, 0])] },
      brow_l: { rotation: [P(0, [0, 0, 0]), P(0.10, [6, 0, 0], 'easeOutBack'), P(0.45, [-6, 0, 0], 'easeOutQuad'), P(1.20, [-9, 0, 0], 'easeInOutQuad')] },
      lobe_front: { rotation: [P(0, [0, 0, 0]), P(0.45, [-8, 0, 0], 'easeOutQuad'), P(1.20, [-14, 0, 0], 'easeInOutQuad')] },
      lobe_back: { rotation: [P(0, [0, 0, 0]), P(0.45, [7, 0, 0], 'easeOutQuad'), P(1.20, [12, 0, 0], 'easeInOutQuad')] },
      drip_f: { scale: [P(0, [1, 1, 1]), P(0.50, [1, 0.60, 1], 'easeOutQuad'), P(1.20, [1, 0.62, 1])],
                rotation: [P(0, [0, 0, 0]), P(0.70, [-14, 0, 0], 'easeOutQuad'), P(1.20, [-20, 0, 0])] },
      drip_l: { rotation: [P(0, [0, 0, 0]), P(0.75, [-18, 0, -8], 'easeOutQuad'), P(1.20, [-24, 0, -12])] },
      drip_r: { rotation: [P(0, [0, 0, 0]), P(0.78, [-16, 0, 9], 'easeOutQuad'), P(1.20, [-22, 0, 13])] },
      bead_l: { position: [P(0, [0, 0, 0]), P(0.50, [0, -0.6, 0], 'easeInOutQuad'), P(1.20, [0, -1.0, 0])], scale: [P(0, [1, 1, 1]), P(1.20, [0.7, 0.7, 0.7], 'easeInOutQuad')] },
      bead_r: { position: [P(0, [0, 0, 0]), P(0.55, [0, -0.55, 0], 'easeInOutQuad'), P(1.20, [0, -0.95, 0])], scale: [P(0, [1, 1, 1]), P(1.20, [0.7, 0.7, 0.7], 'easeInOutQuad')] },
    };
    bonesObj.eye_r = bonesObj.eye_l;
    bonesObj.brow_r = { rotation: [P(0, [0, 0, 0]), P(0.10, [6, 0, 0], 'easeOutBack'), P(0.45, [-6, 0, 0], 'easeOutQuad'), P(1.20, [-9, 0, 0], 'easeInOutQuad')] };
    const armD = [P(0, [0, 0, 0]), P(0.30, [-6, 0, -10], 'easeOutQuad'), P(0.62, [4, 0, -20], 'easeInOutQuad'), P(1.05, [8, 0, -24], 'easeOutQuad'), P(1.20, [9, 0, -26])];
    const antD = [P(0, [0, 0, 0]), P(0.30, [-12, 0, 0], 'easeOutQuad'), P(0.62, [18, 0, -8], 'easeInOutQuad'), P(1.20, [30, 0, -14], 'easeOutQuad')];
    for (const side of [-1, 1]) {
      const s = side < 0 ? 'l' : 'r', m = side < 0 ? 1 : -1, dd = side < 0 ? 0 : 0.04;
      const rot = (keys, amp, off) => keys.map((k) => [k[0] + (off || 0), [k[1][0] * amp, k[1][1], k[1][2] * m * amp], k[2]]);
      bonesObj['lobe_' + s] = { rotation: rot(armD, 1, 0) };
      bonesObj['lobe_' + s + '2'] = { rotation: rot(armD, 0.7, dd) };
      bonesObj['lobe_' + s + '3'] = { rotation: rot(armD, 0.5, dd * 2) };
      bonesObj['antenna_' + s] = { rotation: rot(antD, 1, dd) };
      bonesObj['bulb_' + s] = { rotation: rot(antD, 1.2, dd * 2), scale: [P(0, [1, 1, 1]), P(0.60, [0.8, 0.8, 0.8], 'easeOutQuad'), P(1.20, [0.55, 0.55, 0.55], 'easeInOutQuad')] };
    }
    anim.clip('death', { length: 1.2, loop: false, bones: only(bonesObj) });
  }

  return anim;
};
