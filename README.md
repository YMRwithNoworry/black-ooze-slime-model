# 酸性凝胶史莱姆 · Acid Gel Slime

A hand-built Minecraft **Bedrock / GeckoLib** creature: a fat, glossy mint-gel slime that looks
huggable and is quietly full of acid, obsidian shards and fangs.
一个圆润、可爱、却浑身是酸液与黑曜石尖刺的凝胶史莱姆模型。

Built to the quality bar of the reference creature models in `refs/` (SRParasites / phayriosis_two,
GeckoLib pipeline: Bedrock geometry + Bedrock 1.8 animations).

| file | what |
|---|---|
| `acid_gel_slime.bbmodel` | editable Blockbench project — 5.0 format, bedrock, per-face UV, two embedded textures, all 6 clips |
| `acid_gel_slime.geo.json` | game-ready geometry (`geometry.acid_gel_slime`, format 1.12.0) |
| `acid_gel_slime.animation.json` | 6 clips (`animation.acid_gel_slime.*`, format 1.8.0) |
| `acid_gel_slime.png` | 128×128 base atlas (2.6 KB) |
| `acid_gel_slime_glow.png` | 128×128 emissive atlas, same UVs (0.3 KB) |
| `docs/preview_front.png` · `preview_side.png` · `preview_34.png` · `preview_atlas.png` | rasterised previews |
| `tools/zfight.js` · `tools/lib/zfight.js` | texture-flicker (z-fighting) audit; the build refuses to write while a pair is left |
| `docs/VERIFY.md` | independent verification report (7 check groups, measured numbers) |
| `docs/SPEC.md` · `docs/FORMAT.md` | the design contract, and the verified Blockbench/Bedrock format notes |
| `build_slime.js` · `tools/` | everything is generated: `node build_slime.js` rebuilds all five artifacts |

## 1. The design — 可爱 / 灵动 / 有危险感

**Cute (可爱).** Eyes are 4×4 units — 17 % of body height — with a wide 2-unit gap, a hard white
specular in each iris and a soft second glint; a small closed grin; two tiny fangs poking out of
it; chubby three-cube arms resting on the puddle; a rounded puddle that gives the whole thing a
bottom-heavy, huggable silhouette.

**Lively (灵动).** 38 bones so nothing is rigid: a three-cube arm chain per side, glow-tipped
antennae whose bulbs have their own child bones, three hanging drips, two floating gel beads, and
a core that pulses. Every clip makes the outer parts *lag* the body by 0.1–0.25 s with decaying
amplitude, so the gel wobbles like gel.

**Dangerous (有危险感).** Five obsidian crystal shards grow out of the back and the top-left slope,
tilted and asymmetric, with mint-cyan glow cracks and glowing tips; a faceted acid core in the
belly; brows that drop; and a mouth that opens into a ring of fangs (3 upper + 2 lower + a tongue)
— the closed grin hides it completely, so the reveal lands.

## 2. Rig, size and clips

* 38 bones / 76 cubes, bounds `x −14.5…14.5, y 0…23.5, z −12.3…11.5` (≈ 1.45 blocks), feet at y = 0.
* Rig tree: `all → gel_slime → {skirt → drips, body → {dome(7 layers), core, jelly_top → {knob,
  antennae → bulbs}, arms → 3-cube chains, front apron, back hump, crystals → 5 shards, face →
  {eyes, brows, mouth → {lip, fangs → jaw → teeth/tongue}}}}`.
* Rotations in degrees, positions in model units (16 = 1 block), scale as a multiplier.

| clip | len | loop | what it does |
|---|---|---|---|
| `idle` | 4.0 s | yes | breathing squash, lagging arms/antennae/drips/beads, two blinks, core heartbeat |
| `move` | 1.0 s | yes | one hop: squash → stretch → 2.5-unit apex → splat → settle |
| `attack` | 1.25 s | no | coil back → lunge (+Y leap) → jaw opens → fangs snap shut → recover |
| `roar` | 1.6 s | no | rise and swell, maw held wide with a tremble, crystals flare, settle |
| `spawn` | 1.4 s | no | from a `y 0.15` puddle → overshoot rise → wobble to rest |
| `death` | 1.2 s | no | collapses into a spreading `y 0.20` puddle and stays there |

The closed grin only opens in `attack`/`roar` (plus a deliberately slack mouth in `death`).

## 3. Texture

One 128×128 atlas painted by `tools/slime_texture.js`: 84 tiles, every texel opaque, every colour
either a palette entry or `shade()` of one. The 7 dome layers carry `params.light` 0→1 so they
continue a single 13-step mint→deep-teal ramp; tile tops get a lit rim, bottoms a dark rim, the
lower gel gets bubbles, the upper gel wet streaks. The free space holds a **swatch board**
(13-step tone ramp, a continuous ramp strip, an assembled dome/face reference, 5 texture cards and
the full palette grid) so a human can repaint the model later without guessing.

`acid_gel_slime_glow.png` is the emissive layer at identical UVs: alpha 0 everywhere except the
eye irises/sparks, the core glow, the acid bulbs/beads/flecks and the crystal tips.

## 4. Using it

**Blockbench:** open `acid_gel_slime.bbmodel` — the rig tree, both textures and all 6 clips are
embedded. Keep the exports next to it when exporting to a pack.

**Bedrock resource pack:** put `acid_gel_slime.geo.json` in `models/entity/`, both PNGs beside it,
and point the client entity at `geometry.acid_gel_slime` / `animation.acid_gel_slime.*`. The glow
layer needs a second material — the usual pattern is a render controller with per-bone materials,
or (GeckoLib) a render layer that draws the glow texture over the same geometry:

```json
"render_controllers": [ { "controller.render.acid_gel_slime": {
  "geometry": "Geometry.default", "textures": [ "Texture.default" ],
  "materials": [ { "*": "Material.default" }, { "eye_l": "Material.glow" },
                 { "eye_r": "Material.glow" }, { "core": "Material.glow" },
                 { "bulb_l": "Material.glow" }, { "bulb_r": "Material.glow" },
                 { "bead_l": "Material.glow" }, { "bead_r": "Material.glow" },
                 { "crystal_1": "Material.glow" }, { "crystal_2": "Material.glow" },
                 { "crystal_3": "Material.glow" }, { "crystal_4": "Material.glow" },
                 { "crystal_5": "Material.glow" } ] } } ]
```

**GeckoLib:** `GeoModel` + `GeoAnimatable`, animations bound to `idle`/`move`/`attack`/`roar`/
`spawn`/`death`.

## 5. Rebuild and verify

```bash
node build_slime.js       # regenerates all five artifacts + build/report.json (fails on flicker)
node tools/zfight.js          # texture-flicker audit on its own (exit 0 = no exposed coplanar pair)
node tools/verify_slime.js    # independent verification (exit 0 = no CRITICAL findings)
node tools/preview_slime.js   # rasterised previews + ASCII silhouette/accent maps
```

Everything is code: `tools/lib/` (PNG codec, canvas/palette, atlas + verified UV conventions,
bbmodel/geo/animation writers), `tools/slime_atlas.js` (the tile vocabulary), `tools/
slime_geometry.js` (rig), `tools/slime_texture.js` (painting), `tools/slime_animations.js` (the 6
clips). Change a number, rerun the build, and the project, the exports and the report all follow.

## 6. Texture flicker — the z-fighting fix

A textured face shimmers when *another* face lies on exactly the same plane and points the same
way: both land on one depth value, so the renderer picks a winner per pixel and per frame and the
strip where they overlap swaps texture. That is a geometry bug, not a texture bug — repainting
the atlas never fixes it.

The rig now contains **no exposed coplanar face pair**, and that is enforced, not asserted:

* `tools/lib/zfight.js` is the audit: it groups every face by exact plane, keeps pairs that are
  coplanar **and face the same way** (a `+x` face against a `-x` face is back to back — one of
  them is always culled, so it can never shimmer), requires the overlap to be bigger than
  0.02 × 0.02 units and then probes a 5 × 5 grid over it, counting a sample only when no third
  cube reaches within ±0.03 units of the plane. Coplanar overlaps buried inside the body are
  harmless and stay as they are.
* `build_slime.js` runs it **before** it writes anything and throws while a pair is left, so the
  artifacts can never be rebuilt with the bug back. `node tools/zfight.js` prints the same report.
* 9 real pairs were found and fixed in the **puddle** (8 cubes: four arms, four corner cubes — they
  used to interpenetrate by 0.5 unit and shared their outer planes) plus the **eyes**, the
  **belly core**, the **drip beads**, the **tongue/lower teeth** and the **dome layers**.
  Two fixes are worth naming because they are the general answer rather than a nudge:
  the eight puddle cubes now **abut** instead of sinking into each other (abutting faces point
  opposite ways), and the front apron's back plane abuts the puddle's front wall instead of
  sinking 0.1 into it. Both keep every cube at its exact tile size, so the puddle also lies
  perfectly flat on y = 0 (it used to be staggered 0.00…0.35 by the earlier nudges).
* The remaining cases are nudges of ≤ 0.5 unit (1/32 block, invisible at 16 units per block):
  an eyelid overhangs its sclera by 0.05, dome layer 3 is pulled in 0.05 so the eye keeps its full
  4 × 4 face, the buried belly glow plate is narrowed 0.05, and each drip bead is lifted 0.25–0.35
  off the ground plane it used to share. Every nudge stays inside the verifier's 0.5-unit uv-vs-face
  tolerance, so no face ends up sampled from a differently sized tile.

Limit, stated honestly: the audit covers axis-aligned cubes. A rotated cube's faces are not
parallel to an axis plane, so they cannot be exactly coplanar with one (a shard and its own tip
share a rotation but sit at different offsets); the CLI prints how many rotated cubes it skipped.

## 7. Honest notes and known limits

* **Verified, not assumed.** `docs/FORMAT.md` records the Blockbench/Bedrock conventions that were
  derived from the installed Blockbench source and then confirmed on a real file pair (141 faces,
  0 mismatches); the verifier re-implements them independently and reproduces the round trip on
  the reference pair (39/39 faces). A real bug this caught: the outliner tree must live in
  `outliner` (not in the group records) or Blockbench loads the project flat — fixed.
* **Animation file size.** `acid_gel_slime.animation.json` is 244 KB: the trailing chains are
  *sampled* (8 keys per cycle) instead of hand-keyed, because that lag is the whole point of the
  lively feel. A tolerance-based simplifier in `tools/lib/model.js` already drops every key that
  lies within 0.35° / 0.004 of the chord between its neighbours (verified: worst shape deviation
  0.316°, and no eased curve is ever touched); raising the sampler `step` in
  `tools/slime_animations.js` from 0.25 to 0.5 would halve it again at some cost in smoothness.
* **Small ground dips.** During the most violent frames the mesh dips below the
  ground plane (`death` −0.80, `spawn` −0.39, `idle` −0.34, `attack` −0.06). The
  rest pose, and the whole `roar`, are clean. It is a squash-and-stretch tradeoff, not a rig error.
* **Ground contact.** The whole puddle and the front apron now rest flat on y = 0 (the earlier
  nudges floated most of it 0.00…0.35 up); only the three drip beads are lifted 0.25…0.35, which
  is exactly what breaks the plane they used to share with the ground.
* **Two verifier warnings are intentional**: `spawn`/`death` deform the puddle by >4 units
  (that *is* the collapse), and `idle`/`move` do not end on the rest pose because they are loops —
  the correct invariant there is first key == last key, which holds for every channel.
* **Blockbench load test passed**: launching the installed Blockbench with the project produces no
  error output and a fresh 270x150 thumbnail (`docs/blockbench_thumbnail.png`) — it parses and
  renders. What is *not* verified: the rig tree as drawn in the GUI, and an in-game test.
* The earlier `black_ooze_slime.*` model from a previous brief is still in the repo, untouched.

## 8. Examples

`examples/resource_pack/` holds a Bedrock client entity and a render controller (the emissive
layer), both generated and cross-checked against the built geometry/animations — every bone named
in the controller exists in the rig and every animation state exists in the clips. See
`examples/README.md` for where each file goes.
