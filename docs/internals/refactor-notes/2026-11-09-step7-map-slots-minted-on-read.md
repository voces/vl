# Step 7: map value slots minted on read (2026-11-09)

The branch deletes the collectA#2 pass and makes reads mint what it used to mint ahead of time.
The result is measured against master `8c31c096`, and both seeds are fixpoints.

## What changed

* `mvSlotOfValNameFindK` mints a missing slot through a `mvNameMint` hook in `emit_state`. The hook
  is armed beside `rlRowMint` and cleared by `rlRowMintOff`. The mint is `mvShapeOfValNameRowTy`, and
  a slot it creates after `mAssignTypeIndices` gets its map struct from `mvMapsLate`.
* That deletes the struct-field and arm-field map-slot halves of `collectFieldMapAndShapeRows`.
* The arm record field's struct-row intern stays, as `collectArmStructRows`. A struct row has no late
  mint, so a code-15 row created when the type section reads it would get no heap index. Deleting the
  intern lost two `runs` programs (`emitProgram: nested-struct field element type is not interned`):
  `closures/closure-nullable-union-field-struct-elem-array-result.vl` and
  `types/recursive-type-emit-render-cycle.vl`.
* `sFieldStorageSlot` and `uFieldStorageSlot` ask the ref-list finder only for codes 5 and 28. Those
  are the only codes `pushFieldStorage` reads a slot for. They used to ask for every code, which was
  harmless while the finder only looked rows up. Once it minted, every nullable scalar field cost
  every module one dead `{i32, anyref}[]` backing and wrapper pair. On the branch before this change,
  `type C = {r: i32 | null}` built 7 types where master built 5.

## Measured

| | master | candidate |
| --- | --- | --- |
| fixpoint seed | 6,589,093 | 6,588,864 (−229) |

The full sweep covers 23,792 programs:

* 23,631 are unchanged.
* 0 `runs → not-runs`, 0 new compiler traps and 0 output movers.
* 161 move in bytes only. The 146 `.vl` movers were classified by `wasm-dis`, with indices
  normalised:
  * 141 are a type-index permutation. They have the same type count and are identical modulo
    renumbering.
  * 1 drops the dead box-list pair (`named/d15296_nested_list.vl`).
  * 2 inline a `__map_set_N__` helper into `__start__`, because the slot is minted on read after
    the helper set was chosen (`maps/inferred-map-destination-shape.vl` and
    `maps/union-arm-constructed-map-field.vl`).
  * 2 change a struct's `sub` declaration (`unions/deep-is-json-shape-walk.vl` and
    `unions/list-covariant-escape-unrelated-field-write.vl`). The prefix-subtype test compares
    storage slots, and a scalar field now reads −1 on both sides.

  Every one of the 146 runs and prints what it printed on master.

## Stands

* `collectArmStructRows`: it needs a struct-row late mint, which no table has yet.
* `internArmMapSlotsNamedBy` in `collectS`: it runs before the mint hook is armed.
* The seed saving is 229 B rather than the ~1.4 KB the brief expected. Most of the pass was the
  struct intern that has to stay.
