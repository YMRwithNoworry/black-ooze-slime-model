# Independent verification — acid_gel_slime

Run by the team's verifier role (`tools/verify_slime.js` + `tools/preview_slime.js`), then reviewed
and written up by the lead. Everything below is re-derived from the **files**, never from
`build/report.json`.

```bash
cd D:/MC/模型
node build_slime.js        # regenerate the artifacts
node tools/verify_slime.js # exit code 0 = no CRITICAL findings; writes docs/verify_results.json
node tools/preview_slime.js# writes docs/preview_*.png + prints ASCII silhouette/accent maps
```

## Verdict

**SHIP-ABLE — 0 CRITICAL, 2 WARNING, 10 INFO, and all seven check groups PASS** (18/18, 16/16, 13/13, 10/10, 31/31, 11/11, 1/1):

| group | check | result |
|---|---|---|
| G1 | `.bbmodel` structure (meta 5.0 / bedrock / box_uv false, outliner↔groups, unique names/uuids) | PASS 18/18 — 38 groups, 76 elements, 1 outliner root, tree reachable |
| G2 | textures embedded, `internal:true`, decode 128×128 RGBA, base fully opaque, glow alpha 0 outside emissive families | PASS 16/16 |
| G3 | `.geo.json` parity with the bbmodel (origin/size/inflate/rotation + per-face UV convention) | PASS 13/13 — 440/440 faces, 0 uv mismatch |
| G4 | atlas: rects reproduce a fresh shelf packing, no overlap, every rect inside a painted tile | PASS 10/10 — 84/84 tiles used, 0 stretched faces |
| G5 | animations: 6 clips, format 1.8.0, names/lengths/loops, bones exist, times in range, tear metric | PASS 31/31 (2 warnings, below) |
| G6 | aesthetics (measured): face mirror, maw hidden at rest, nothing below y=0, eyes on −Z, crystals on +Z | PASS 11/11 |
| G7 | convention self-test against a real Blockbench pair (`refs/infested_zombie` vs its export) | PASS 39/39 faces over 7 cubes |
| F1 | texture flicker (coplanar same-facing exposed faces) − build gate, not one of G1…G7 | PASS 0 pairs exposed after the fix (9 found and fixed) |

## Measurements

```
bones 38   cubes 76   tiles 84   clips 6
bounds x −14.5…14.5  y 0…23.5  z −12.3…11.5     (fits the 2.5³ visible box: 1.45 blocks)
atlas: 3354 px claimed of 16384 (20.5 %), glow 73 px emissive, 0 px stray
geo:   38 bones, 76 cubes, 440 faces compared, 0 uv mismatch
uv:    440 textured faces, 84/84 tiles used, 0 stretched, 88 whitelisted thin/seam stretches
aesthetics: 7 mirrored pairs (0 asymmetric), maw frontmost in 40/1280 front samples (= the
            intended fangs, not the cavity), min y = 0 in rest, eye height 17 % of body
convention self-test: 39/39 faces over 7 cubes reproduce Blockbench's stored-value round trip
```

Per clip (tear = worst bone-tip displacement from its parent; moves = worst absolute travel):

| clip | len | loop | bones | keys | tear | min y @mid | ends at rest |
|---|---|---|---|---|---|---|---|
| idle | 4.0 | yes | 28 | 526 | 0.79u | −0.34 | loop (first == last per channel) |
| move | 1.0 | yes | 27 | 179 | 2.54u | +0.03 | loop (first == last per channel) |
| attack | 1.25 | no | 36 | 236 | 3.27u | −0.06 | yes (dev 0) |
| roar | 1.6 | no | 31 | 245 | 2.37u | +0.37 | yes (dev 0) |
| spawn | 1.4 | no | 28 | 177 | 4.39u | −0.39 | yes (dev 0) |
| death | 1.2 | no | 29 | 159 | 4.18u | −0.80 | no — collapses and stays (by design) |

## Findings

**W-01 / W-02 — `spawn` moves `skirt` 4.39u and `death` moves `jelly_top` 4.18u from their parents.**
*Intentional* — these two clips *are* extreme deformation (a `y 0.15` puddle forming, a `y 0.20`
puddle collapsing), so the outer corners legitimately travel ~4 units. The checker reports them as
informational for these two states, and no bone tears: the clips stay connected.

**Resolved since the first report.** The two "loop does not return to rest" items were a checker
false positive (a loop must end where it *starts*; that invariant is verified separately and holds
for every channel) — the checker now says so explicitly. Also fixed at the source: the canvas base
colour equalled gel-ramp step 8, which made correctly painted tiles look unpainted (303 texels) and
mis-scored the atlas; and the `void` tile is no longer the same colour as the base.

**W-03 / W-04 — `spawn` moves `skirt` 4.39u and `death` moves `jelly_top` 4.18u from their parents.**
*Intentional.* These are the two clips whose whole point is extreme deformation: `spawn` starts as
a `y 0.15` puddle and `death` ends as a `y 0.20` one (both spec-mandated), so the outer puddle
corners legitimately travel ~4 units. No tear — the bones stay connected.

**I-01 — 48 cubes use non-integer sizes** (e.g. the 2.1-deep eyes, the 0.8-deep core gem): the
frozen anchors in `docs/SPEC.md` use fractional sizes on purpose for a rounded silhouette.

**I-02 — painted pixels outside every declared tile**: the deliberate swatch board / palette grid
in the atlas's free space (§3 of the README). No face samples it.

**I-03…I-07 — small ground dips** during the most violent frames (−0.06 … −0.80 units). Rest pose
and the whole `roar` are clean. This is the squash-and-stretch tradeoff; documented in the README.

**I-08 — 3 decorative pairs asymmetric**: crystals, drips and beads are deliberately asymmetric
(organic), while every *face* feature (eyes, brows, lid, lip, fangs) mirrors exactly — G6 confirms
0 asymmetric face pairs.

**I-09 — 40/1280 front samples show tooth tips outside the lip band**: those are the two small
fangs that are *supposed* to poke below the grin (SPEC §2). The maw cavity itself is never
frontmost.

## Texture flicker (z-fighting) − fixed after the first report

The model used to shimmer: **9 pairs** of cube faces sat on exactly the same plane, pointed the same
way and overlapped *visibly*, so both landed on one depth value and the renderer swapped between them
per pixel and per frame. Two cubes sharing a plane is a *geometry* bug, so no repaint could fix it.

Found by `tools/lib/zfight.js`: group every face by exact plane, keep the pairs that (a) are
coplanar, (b) face the *same* way (a `+x` face against a `-x` face is back to back − one of them
is always culled and can never shimmer), (c) overlap by more than 0.02 x 0.02 units and (d) are
exposed, i.e. a 5 x 5 probe grid over the overlap finds no third cube reaching within +/-0.03 units
of the plane that would hide the seam inside the body. **After the fix: 0 exposed pairs and 0 thin
gaps**, out of 60 axis-aligned cubes (16 rotated cubes are skipped by construction: a rotated face is
not parallel to an axis plane, and a shard and its own tip are parallel but at different offsets).

Two of the fixes are structural rather than cosmetic: the puddle's eight cubes now **abut** instead of
interpenetrating by 0.5 unit (abutting faces point opposite ways), and the front apron's back plane
abuts the puddle wall instead of sinking 0.1 into it. Both keep every cube at its exact tile size, so
the uv check below also improved to **0 stretched faces** (12 were stretched after the first pass of
nudges) and the puddle now rests flat on y = 0. The rest are nudges of at most 0.5 unit (1/32 block):
an eyelid overhangs its sclera by 0.05, dome layer 3 is pulled in 0.05, the buried belly glow plate
is narrowed 0.05, and the three drip beads are lifted 0.25…0.35 off the plane they shared with
the ground.

This audit is a **build gate**, not one of the seven verifier groups: `build_slime.js` runs it before
it writes any artifact and throws while a pair is left, and `node tools/zfight.js` prints the same
report on its own (exit 1 if anything remains). It shares its code with the build, so it is a
regression lock rather than an independent measurement.

## Blockbench load test (added after the first report)

Run: `cd "C:/Users/Administrator/AppData/Local/Programs/Blockbench" && timeout 45 ./Blockbench.exe
"D:/MC/模型/acid_gel_slime.bbmodel"`

Result: **the project loads.** Blockbench produced no error output of any kind (stdout/stderr
empty) and wrote a fresh thumbnail (`thumbnails/0188119691.png`, 270x150) for the loaded project —
it only renders one after a project parses cleanly. That thumbnail is 59.4 % mint-green with 5.7k
dark shard/eye pixels, i.e. unambiguously this model, and is kept in the repo as
`docs/blockbench_thumbnail.png`. A second launch (after the last fixes) also loaded with an empty
log; the extra thumbnail it wrote was not this model, so the first, verified one is the committed
evidence.
This also confirms the outliner fix end to end: the rig tree is built from `outliner` and the
project is no longer loaded flat.

## What could NOT be verified

1. ~~Opening the project in the Blockbench GUI~~ — done, see above. Not verified: the *rig tree
   shape inside the GUI* (I can only prove it loaded and rendered, not that every bone parents as
   intended on screen) and anything requiring interaction (editing, exporting from the UI).
2. **An in-game / GeckoLib runtime test** (materials, the emissive render layer, animation
   blending in engine).
3. **Subjective art quality.** The 可爱 / 灵动 / 有危险感 verdict below is evidence-based, not a
   human playtest; the rasterised previews in `docs/` are the closest substitute.
4. **The verifier's own maw ray test uses a 0.25-unit grid**; a 0.2-unit sliver could in principle
   hide between samples (a finer probe was planned but not completed).

## 可爱 / 灵动 / 有危险感 — evidence

* **可爱 (cute).** Eyes are 4×4 units (17 % of body height, measured), separated by a 2-unit gap,
  each with a hard white specular plus a soft second glint in the iris; the closed lip is a 7×3
  grin with a wet gleam above it and two 1×1 fangs poking below; the silhouette is bottom-heavy
  (puddle 22 units wide vs 18-unit dome) and the arms are chubby 6×6×6 lumps resting on it.
* **灵动 (lively).** 28–36 bones are animated per clip. Every trailing part lags its parent by
  0.10–0.25 s with decaying amplitude (arm chain 8° → 5.2° → 3.6°), the antennae quiver on a second
  harmonic, the core beats twice per idle cycle, the eyes blink twice (0.10 s down, `easeOutBack`
  up), the drips stretch on independent periods and the beads bob. Two flashes of motion per idle
  cycle keep it alive without looking noisy.
* **有危险感 (dangerous).** Five tilted, asymmetric obsidian shards (4×6 and 3×5) with glow cracks
  and emissive tips break the upper silhouette on the back and top-left; the belly core is a
  faceted acid gem with its own emissive layer; the brows drop 9–11° and the eyes narrow to 62 %
  in `attack`/`roar`, where the lip lifts 27–32° and the jaw drops to expose a ring of 5 fangs and
  a tongue that the closed grin hides completely at rest.
