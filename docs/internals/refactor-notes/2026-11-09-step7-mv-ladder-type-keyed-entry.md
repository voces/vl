# Step 7: the mv ladder has a type-keyed entry (2026-11-09)

Base: #7012's head (`ff3bfc81`). Both seeds are fixpoints (two self-compiles, byte-identical).

## What changed

* **`mvShapeOfValTyK(ty, keyK, armTy)`** (emit_union_atoms) enters the map-value ladder with a
  type. It names the value as the mint keys a declared value (`mvDeclNameOfValTy`, the name
  `mvShapeOfMapHeldTy` already keys by), so no type is rendered to be parsed back.
* **The map-twin arm reads the member type.** #7003's arm in `mvShapeOfValNameArmTyGo` rendered
  the union's one map with `tyToEmitName` to re-enter the name-keyed ladder. It now calls
  `mvShapeOfValTyK(twin, …)`. The render-parse budget for `emit_union_atoms.vl` goes back from
  2 to 1 (`ty-render` 42 → 41), and the baseline is written in this change.

## Measured

Seed: 6,591,575 → 6,591,650 (+75).

Sweep, #7012's seed against this one on the same tree (23,809 programs): 23,809 the same, 0
bytes-only movers, 0 output movers. The ladder's find is already type-keyed
(`mvSlotOfTyKArm`), so the name the twin arm passes changes no slot. The witness
`{[string]: LM | IM}` (`tests/cases/maps/map-twin-union-is-its-one-map.vl`) prints as pinned.
