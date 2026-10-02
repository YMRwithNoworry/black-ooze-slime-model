# Drop-in examples

These are **starting points** for wiring the model into an addon. Place them like this:

```
<your_addon>/
  RP/                                  (resource pack root)
    entity/acid_gel_slime.entity.json
    render_controllers/acid_gel_slime.render_controllers.json
    models/entity/acid_gel_slime.geo.json          <- copy from the repo root
    animations/acid_gel_slime.animation.json       <- copy from the repo root
    textures/entity/acid_gel_slime/acid_gel_slime.png
    textures/entity/acid_gel_slime/acid_gel_slime_glow.png
    texts/en_US.lang                               e.g. entity.acid_gel_slime.name=Acid Gel Slime
  BP/                                  (behaviour pack root)
    entities/acid_gel_slime.json                   <- your own, not included
    ...
```

## What the two files do

* `entity/acid_gel_slime.entity.json` — client entity: geometry, both textures, the six
  animations and a small `scripts.animate` state machine (idle always, `move` above a
  movement-speed threshold, `roar` while `variable.attack_time > 0`, `spawn` on spawn).
* `render_controllers/acid_gel_slime.render_controllers.json` — one controller that draws the
  default material everywhere and the `glow` material on the emissive bones, which is how the
  second texture (`acid_gel_slime_glow.png`) becomes an emissive layer.

Both files were generated and then cross-checked against the built artifacts: every bone named in
the controller exists in `acid_gel_slime.geo.json`, and every animation state named in the entity
exists in `acid_gel_slime.animation.json` (6/6 clips, 12/12 glow bones).

## GeckoLib instead of vanilla Bedrock?

Use the same `acid_gel_slime.geo.json` + `acid_gel_slime.animation.json` for a `GeoModel` /
`GeoAnimatable`, and add the glow texture as a render layer rather than through a render
controller. The animation names are plain GeckoLib-friendly
(`animation.acid_gel_slime.idle`, `.move`, `.attack`, `.roar`, `.spawn`, `.death`).

## Notes

* `scripts.animate` is a *suggestion*: exact state names in your own entity (`variable.attack_time`,
  `query.modified_move_speed`) depend on how you define the mob.
* The behaviour-pack entity (health, hitbox, loot, jump control) is deliberately not included —
  this repo ships the **model**, not the mob.
