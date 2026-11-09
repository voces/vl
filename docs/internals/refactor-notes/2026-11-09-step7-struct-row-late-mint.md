# Step 7: a struct row minted after the type indices gets its heap index at mint (2026-11-09)

Base: #6997's head (`b61c2625`). Both seeds are fixpoints (two self-compiles, byte-identical).

## What changed

* **Struct rows have a late mint.** `structRowsLate` (emit_sections) gives each struct row past the
  end of `sHeapIdx` its twin (`structLateTwinOf`, which gives `buildStructTwins`' answer for one
  row), its heap index (the twin's, or a fresh `mAllocType(TSK_STRUCT)`), and a supertype picked
  by the rule `buildStructSupers` uses, now factored out as `structSuperPick`. The hook
  `sLateRows` (emit_state) is armed right after `buildStructSupers` and cleared by
  `rlMvTablesReset`. It fires when the outermost `internInlineShapeFieldsTy` returns, so a row is
  never indexed with its fields half-pushed. A late row sits above every row that was already
  indexed, so it can take one of them as its supertype but cannot be a supertype itself.
* **`collectArmStructRows` is deleted.** `uFieldTgtStructIdx` mints on a miss through a new
  `armStructRowMint` hook. The hook is armed in `collectUnionAndHeldRows` beside `rlArmRowMint`,
  cleared by `rlRowMintOff`, and gated on the field being `FC_STRUCT`. It interns the field's row
  and re-keys `sFieldElemName`, as the deleted pass did. The bare deletion lost two programs
  (`closure-nullable-union-field-struct-elem-array-result.vl` and
  `recursive-type-emit-render-cycle.vl`, both `nested-struct field element type is not interned`).
  With the hook and the late mint, both run.
* **The union pass no longer reads a map-element arm early.** `markRefArrayArmsOf` mints only a
  recursive element's arm row now. Rep-fuzz seed 1234 case 12
  (`{[string]: {a: f64, f: string | {w: i32}, z: i32}}[] | {w: i32}`) used to refuse with `the type
  section wrote 13 rec-group entries … allocated 8`. Its first read was not a struct row. It was
  `tsMvMap` minting the string-list wrapper for a late map struct's `keys` field during the placed
  type-section render, after the functype base had been read. `mvMapsLate` now mints that keys
  wrapper with the struct once type indices are assigned (`mvKeysAtMint`). It does not do this
  inside `mAssignTypeIndices`, so no early index moves.
* **`internArmMapSlotsNamedBy` and `internArmFieldMapSlot` are deleted** (collectS's up-front intern
  of a named arm's map slots, D15097). With the late mints, D15097's fixture and both
  `struct-holding-arm-with-*map-field` position matrices still grade without loss.

## Stands

* `tyReachesCycle`'s early read of a recursive element's arm (queue item 2, D4153). Unchanged.
* A late struct row cannot be the supertype of an earlier, wider row. The sweep found no program
  that needs it to be.

## Measured

| | base | candidate |
| --- | --- | --- |
| fixpoint seed | 6,590,849 | 6,591,841 (+992) |
| merged with master `cf536d88` | 6,587,970 | 6,588,947 (+977) |

The sweep covers 23,799 programs (base vs candidate):

* 0 `runs → not-runs` and 0 new compiler traps.
* 0 output movers. The bytes-only movers are D15098, D187, `maps/array-of-map-union-arm.vl`,
  `types/array-alias-map-element.vl`, and the two `unions/struct-holding-arm-with-*` fixtures.
* `rep-fuzz-check.sh` is exact.
* D14041 and D14042 still refuse as filed.
* The capability matrices `struct-holding-arm-with-map-field` and
  `struct-holding-arm-with-record-map-field` (`--before` base, `--after` candidate) have 0
  `runs → not-runs`, 0 silent cells and 0 program traps.
* `late-demands --check` is 6, the same as its baseline.
