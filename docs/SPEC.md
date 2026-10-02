# 酸性凝胶史莱姆 / Acid Gel Slime — frozen design spec

Deliverable: an excellent Minecraft (Bedrock / GeckoLib) creature model — **可爱 (cute)**, **灵动
(lively)**, **有危险感 (dangerous)** — shipped as an editable Blockbench project plus game-ready
exports. Reference bar: `refs/*.bbmodel` (SRParasites / phayriosis_two, GeckoLib pipeline).

## 0. Files

| file | owner | what |
|---|---|---|
| `acid_gel_slime.bbmodel` | lead (assembled) | Blockbench project, format 5.0, 2 embedded textures, 6 animations |
| `acid_gel_slime.geo.json` | lead | `geometry.acid_gel_slime`, format 1.12.0, per-face UV |
| `acid_gel_slime.animation.json` | lead | format 1.8.0, `animation.acid_gel_slime.<state>` |
| `acid_gel_slime.png` / `_glow.png` | lead | 128x128 base atlas / emissive atlas |
| `build/report.json` | lead | machine-readable build report (bones, cubes, tiles, warnings) |
| `docs/preview_*.png`, `docs/VERIFY.md` | verifier | rasterised previews + independent verification report |
| `tools/lib/*`, `tools/slime_atlas.js`, `build_slime.js` | lead | shared library, atlas vocabulary, orchestrator |
| `tools/slime_geometry.js` | modeler | rig + cubes |
| `tools/slime_texture.js` | texture-artist | base + glow atlas painting |
| `tools/slime_animations.js` | animator | the 6 clips |
| `tools/verify_slime.js`, `tools/preview_slime.js` | verifier | independent checks + ASCII/PNG rendering |

Build: `node build_slime.js` from the project root. Producers only edit their own module file.

## 1. Design intent

A fat, glossy mint-teal gel slime that looks huggable — huge glossy eyes, a small closed grin,
stubby arms, a rounded puddle. Under that: dark obsidian crystal shards growing out of its back,
a glowing acid core in its belly, glow-tipped antennae, and a mouth that opens into a ring of
fangs. Cute at rest, unmistakably dangerous when it opens up.

* silhouette: rounded, lumpy, slightly bottom-heavy; reads as a slime from any angle
* cute: eyes ~ 1/5 of the body height, big highlights, small mouth, chubby arms, symmetric face
* danger: crystals, acid glow, fangs + maw, brows, core gem, deliberate asymmetric details
* lively: 3 rigged joints per arm, antennae with lagging bulb bones, hanging drips, floating beads

Palette (see `tools/lib/canvas.js` `PALETTE`): mint gel `gelHi..gelDeep`, acid `acidPale..acidDark`,
obsidian crystal `xtalDark..xtalGlow`, glossy eyes `eyePit..eyeSpark`, maw `mawDeep..toothEdge`.
Never introduce colours outside `PALETTE`; ask the lead if one is missing.

## 2. Frozen anchors (do not move)

Coordinates: front = **-Z**, right = **+X**, up = **+Y**, ground `y = 0`. Symmetric about `x = 0`
except where noted. All sizes integer (half-integer positions allowed).

* dome profile (bone `dome`, cubes `<L>_a` + `<L>_b`, crossed to give an octagonal footprint):
  `L1 y2..6 A x±9 z±6 / B x±6 z±9`, `L2 y6..9 ±8.5/±5.5`, `L3 y9..12 ±7.5/±5`, `L4 y12..14 ±6.5/±4.5`,
  `L5 y14..16 ±5/±3.5`, `L6 y16..18 ±4/±3`, plus `L7_a y18..19 x±2.5 z±2.5` (cap)
* skirt: 4 cubes `y0..3` — `f x±6.5 z-11..-6`, `b x±6.5 z6..11`, `l x-11..-6 z±6.5`, `r x6..11 z±6.5`
* core gem: `x±3 y2.6..4.6 z-9.7..-8.9`; glow `x±1.5 y3..4.2 z-9.85..-9.75`
* eyes (mirror pair, bone `eye_l`/`eye_r`, pivot `±3,10,-8.5`): sclera `x 1..5 (mirrored) y8..12
  z-9.5..-7.4`, iris `±3∓1.5 y8.9..11.3 z-9.62..-9.52`, spark `y10.2..11.2`, lid `y11.6..12.6`
* mouth: lip `x±3.5 y4.4..7.4 z-9.9..-8.9` (front face 7x3 = `lip_grin`), fangs `y3.6..4.6`
  (upper, poking below the grin) and `y7.4..8.0` (lower), maw cavity `x±3.5 y4.2..7.6 z-8.85..-6.6`
* knob `x±3 y18.5..21 z±3`; antenna pivots `±3,20.5,-1`

The closed lip must completely hide `maw_inner` and every tooth at rest (nothing may poke out
between `z -8.85` and `-6.6`).

## 3. Rig (32 bones declared in `tools/slime_geometry.js`)

```
all ─ gel_slime ─┬ skirt ─┬ (4 skirt cubes) ┬ drip_f / drip_l / drip_r
                 │        └ TODO 4 rounded corner cubes
                 └ body ─┬ core (gem + glow)
                          ├ dome (L1..L7 = 13 cubes)
                          ├ jelly_top ─┬ knob
                          │            ├ antenna_l ─ TODO bulb_l
                          │            └ antenna_r ─ TODO bulb_r
                          ├ lobe_l → lobe_l2 → TODO lobe_l3
                          ├ lobe_r → lobe_r2 → TODO lobe_r3
                          ├ lobe_front, lobe_back
                          ├ crystals → crystal_1..5 (TODO 2 cubes each)
                          ├ face ─┬ eye_l (sclera/iris/spark/lid)  [FROZEN]
                          │       ├ eye_r (sclera/iris/spark/lid)  [FROZEN]
                          │       ├ brow_l, brow_r (TODO 1 cube each)
                          │       └ mouth ─┬ lip, fang_ul, fang_ur  [FROZEN]
                          │                ├ maw ─ TODO 5 teeth + tongue
                          │                └ jaw (pivot 0,4.4,-8.9 — opens the mouth)
                          └ TODO bead_l, bead_r (floating gel beads)
```

Every bone needs a pivot that a rotation can believably turn around (joint, not centre of mass).

## 4. Atlas rules

`tools/slime_atlas.js` is the only vocabulary: 71 tiles, each with a `family` the painter
understands. A face must map to a tile whose pixel size equals the face size; exceptions are
`seam_dark`/`void_px` and thin details (ask the lead for a new tile instead of stretching).
The base atlas must stay fully opaque; only glow families are painted on the glow atlas.

## 5. Animation clips

`animation.acid_gel_slime.<state>`, rotations in degrees, positions in model units (16 = 1 block).

| state | len | loop | beats |
|---|---|---|---|
| `idle` | 4.0 | yes | breathing squash 1→1.03, lagging lobes, antenna sway 0.25 s offset, 2 blinks, core pulse, drips stretch |
| `move` | 1.0 | yes | hop: squash 0.9/1.12 → stretch in the air (position +2.5) → landing splat, arm + lobe lag |
| `attack` | 1.25 | no | wind-up lean back → lunge + squash → maw opens wide, fangs snap shut → recover |
| `roar` | 1.6 | no | rise and swell, mouth wide open showing the maw, brows down, crystals flare, acid flare, settle |
| `spawn` | 1.4 | no | puddle scale (y 0.15) → overshoot rise → wobble to rest |
| `death` | 1.2 | no | collapse: y-scale to 0.2, x/z to 1.35, eyes squash, antennae droop, mouth slack |

Rules: no bone may separate visibly from the body, the smile must stay shut outside `attack`/`roar`,
and every clip has to return to the rest pose at its last keyframe unless it is `death`.

## 6. Acceptance criteria

1. `node build_slime.js` runs clean from the project root.
2. `.bbmodel` parses, `meta.format_version = 5.0`, bedrock, `box_uv:false`, both textures embedded
   (`internal:true`) and decoding to 128x128 RGBA PNGs, every group uuid in `outliner`, every
   element uuid in a group, unique bone/cube names, no element without a texture reference.
3. `.geo.json` matches the bbmodel cube-for-cube (origin/size/uv/rotation/inflate) and uses only
   the verified face-UV conventions; UVs inside the atlas; no negative size; bones in parent-first
   order.
4. `.animation.json`: format 1.8.0, 6 clips with the names above, every animated bone exists in the
   rig, times inside `animation_length`, loops correct.
5. Textures: all 71 tiles painted, no unpainted claimed pixel, glow atlas transparent outside glow
   families, and the palette used as specified (no stray colours).
6. Independent verification (verifier) reports zero CRITICAL findings; previews in `docs/`.
7. README documents install/usage, the client-entity snippet for the emissive layer, and the
   design rationale.
