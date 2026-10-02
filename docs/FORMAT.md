# Blockbench / Bedrock format notes (verified on this machine)

Everything here was derived from real artifacts, not from memory:

* Blockbench 4.x/5.x is installed at
  `C:/Users/Administrator/AppData/Local/Programs/Blockbench` and has been used on this machine
  (`AppData/Roaming/Blockbench/backups/*.bbmodel` are real projects it wrote).
* The authoritative sources are the reference projects in `refs/*.bbmodel`, their exported
  geometry in `D:/MC/保存精品模型/{1,2,3,4,5}.json`, and the GeckoLib animation files in
  `D:/MC/杂物/phayriosis_two-B.0.0.6-forge-1.20.1/assets/phayriosis_two/animations/*`.
* Blockbench's own loader/exporter source was checked (animation.js, keyframe.js,
  bedrock_animation.js) so the .bbmodel animation block matches what it expects.

## Face UV conventions — verified against 141 faces (0 mismatches)

For a face with a min-first rect `[a,b,c,d]` (a<c, b<d) in texture pixel space, origin top-left:

| storage | value |
|---|---|
| `.bbmodel` `faces.north/east/south/west.uv` | `[a,b,c,d]` |
| `.bbmodel` `faces.up.uv` | `[c,d,a,b]` (both axes reversed) |
| `.bbmodel` `faces.down.uv` | `[c,b,a,d]` (u reversed) |
| `.geo.json` `uv` for all faces except `down` | `uv:[a,b]`, `uv_size:[c-a, d-b]` |
| `.geo.json` `uv` for `down` | `uv:[a,d]`, `uv_size:[c-a, b-d]` (negative height) |

A face whose UV rect is smaller/larger than the cube face is stretched — legal, but we only do it
for thin seams (`seam_dark`) and tiny details, and the build warns about every other case.

## `.bbmodel` project (what we emit)

* `meta = { format_version: "5.0", model_format: "bedrock", box_uv: false }` — per-face UV, like
  reshape_yelloweye / kirin / draconite / infested_zombie.
* Groups live in a separate `groups` array (name, uuid, origin=pivot, rotation, color, mirror_uv,
  export, visibility, `_static`, `primary_selected`, ...); `outliner` is only the tree
  (`{uuid, isOpen, children:[uuid|node]}`).
* Elements (`type:"cube"`) carry `from`/`to`/`origin`/`rotation`/`inflate`/`autouv`/`color`/
  `export`/`faces{<dir>:{uv, texture}}`; `texture` is the index into `textures`.
* `textures[]` embed the PNG as `source: "data:image/png;base64,..."` with `internal:true`,
  `use_as_default` on index 0. A second texture is the conventional place for an emissive layer
  (see infested_zombie, which ships `*_glow.png` the same way).
* `model_identifier` must be snake_case without the `geometry.` prefix; `bedrock_animation_mode`
  is `"entity"`; `visible_box` is `[w,h,d]`.

## `.bbmodel` animations (so Blockbench shows them)

Blockbench stores them in the top-level `animations` array; its loader
(`js/animations/animation.js`) matches `Animation.properties` + `Merge.*` and **ignores unknown
keys**, so extra keys are harmless and missing ones fall back to defaults:

```json
{ "uuid": "...", "name": "animation.acid_gel_slime.idle", "loop": "loop", "override": false,
  "selected": false, "length": 4, "snapping": 24, "markers": [], "type": "animation", "path": "",
  "animators": { "<group uuid>": { "name": "body", "type": "bone", "keyframes": [
     { "uuid": "...", "time": 0, "channel": "rotation", "color": -1, "uniform": false,
       "interpolation": "linear", "easing": "easeInOutSine",
       "data_points": [ { "x": 0, "y": 0, "z": 0 } ] } ] } } }
```

* `channel` ∈ `rotation | position | scale`; `loop` ∈ `loop | once | hold`; animators are keyed by
  group uuid (a bone *name* also works — it is matched case-insensitively).
* `interpolation` ∈ `linear | catmullrom | bezier | step`; `easing`/`easingArgs` are the
  Bedrock-style curves and are exported verbatim.
* `data_points` always has one entry for plain numeric keyframes. Blockbench writes keyframe
  values through to the exported animation JSON unchanged (only the x axis of position and x/y of
  rotation get sign-flipped by the exporter).

## `.geo.json` (Bedrock geometry, what GeckoLib/Blockbench consume)

```json
{ "format_version": "1.12.0",
  "minecraft:geometry": [ { "description": { "identifier": "geometry.acid_gel_slime",
      "texture_width": 128, "texture_height": 128,
      "visible_bounds_width": 2.5, "visible_bounds_height": 2.5, "visible_bounds_offset": [0,1,0] },
    "bones": [ { "name": "body", "parent": "all", "pivot": [0,4,0], "rotation": [0,0,0],
      "cubes": [ { "origin": [-3,12,-2], "size": [6,6,4], "inflate": 0.01,
        "pivot": [0,0,0], "rotation": [0,0,0],
        "uv": { "north": { "uv": [23,24], "uv_size": [6,6] }, "...": {} } } ] } ] } ] }
```

* Parent bones must appear before their children; `pivot` is mandatory; per-cube `pivot` is only
  emitted when the cube itself is rotated.
* Missing `uv` on a cube is legal (it then just doesn't render textured) — we always emit UVs.

## `.animation.json` (Bedrock 1.8.0, GeckoLib compatible)

```json
{ "format_version": "1.8.0",
  "animations": { "animation.acid_gel_slime.idle": {
      "loop": true, "animation_length": 4,
      "bones": { "gel_slime": { "rotation": { "0.0": { "vector": [0,0,0] },
                                             "1.0": { "vector": [0,0,5], "easing": "easeOutQuad" } },
                               "scale":    { "vector": [1.2, 1.2, 1.2] } } } } } }
```

* `loop` is `true` or the string `"hold_on_last_frame"`; keyframe times are the JSON keys
  (`"0.0"`, `"0.4167"`...); a channel may be a single constant object (`{"vector":[...]}`).
* **Units**: rotation in degrees, scale a multiplier, `position` in *model units* — the same units
  as the geometry (16 = 1 block). Measured across the reference mod's 11 animated creatures
  (e.g. a 35-unit-tall explosion moving position by up to 23, a 28-unit sheep by 1–3), so a 2.0
  position is a 2-pixel hop, *not* two blocks.
* Easing names seen in the wild: `easeInQuad`, `easeOutQuad`, `easeInOutQuad`, `easeInSine`,
  `easeOutSine`, `easeInOutSine`, `easeInExpo`/`easeOutExpo`/`easeInOutExpo`, `easeInCirc`,
  `easeOutBack`, `easeInOutBack`, plus `catmullrom` as `lerp_mode`.

## Glow / emissive layer

Bedrock geometry has no per-face texture index, so an emissive layer is a *second texture with the
same UV layout* bound through a render layer / second material. We ship `acid_gel_slime_glow.png`
transparent everywhere except the emissive tiles (eyes, core, acid bulbs/beads/flecks, crystal
tips), which sits exactly on top of the base atlas, and mark those faces with texture index 1 in
the .bbmodel so Blockbench previews the split. `README.md` documents the client-entity snippet.
