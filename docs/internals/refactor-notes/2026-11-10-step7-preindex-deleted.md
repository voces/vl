# Step 7: `preIndexMintTrees` deleted; a `Map()`/`Set()` slot mints from the checker's record (2026-11-10)

Measured on #7061's tree (seed 6,601,740) and re-proved after merging master `bcf337c7` with #7061
(seed 6,601,341). Both seeds are fixpoints (two self-compiles, byte-identical). The population
is the sweep's 23,832 programs.

## What changed

* **`preIndexMintTrees` and `preIndexMintAt` are deleted.** The emitter walks no emitted tree
  before the type indices are dealt.
* **`mapCtorRowsMint` reads `ambientCtorCalls`** (`check_core_state.vl`) at the walk's slot.
  This is the checker's record of every `Map()`/`Set()` call it typed as the ambient constructor.
  The function also reads each instance's copy of such a call, which is a node whose `nodeSrc`
  is in the record. The checker typed only the template's node.
* **`collectACallMint` is the `Map()`/`Set()` arm alone**, and `collectACallIntrinsic` is gone.

## The sub-case, and what each try lost

#7061 measured the arm at 396 runs → not-runs and 111 new traps.

| `mapCtorRowsMint` reads | runs → not-runs | traps |
| --- | --- | --- |
| `ambientCtorCalls` only | 1: `named/mty_loc_mapmap_f64.vl`, a generic instance's `Map()` | 0 |
| the above, plus copies, skipping a call whose type holds a type variable | 8: hole-function map values (D9183, D9252, D9715, D12340, four `closures/hole-fn-*map*`) | 0 |
| the above, plus copies, no skip | **0** | **0** |

A hole function's call type holds a type variable, so "a template's call" cannot be told apart
by its type. A template's call is minted too. Its row is a type no emission reads.

## Measured

* Sweep against base (both one-level builds by the base seed): 23,598 same, 233 bytes-only
  movers, 1 output mover, **0 runs → not-runs, 0 new traps**.
* **Bytes-only movers.** Each of the 233 was built on both seeds. For 232 of them the two modules
  are the same size, and their `wasm-dis` output is identical once numbers are erased and lines
  sorted. These are type-index reorders: the record's insertion order is not the walk's order.
  The 233rd, `maps/inferred-map-destination-shape.vl`, shrinks from 11,317 to 11,295 bytes. Base
  emits nine `__map_set_*__` helpers and the candidate eight. Base had two mv slots for one map
  value, and the candidate has one. The output is the same.
* **Output mover.** D15219 is invalid wasm inside `g` on both sides, with the same type mismatch
  over `{f:i32}`. Only that type's index in the message moves, from `$4` to `$5`.
* D14041 and D14042 have the same outcome and message on both seeds. A `Map()` of a literal
  union and one of its nullable form build byte-identical modules on both seeds.
* Seed 6,601,740 → 6,601,355 (−385).
* Oracle (`cases_wasm_*`), inventory refs/rows and `vl_scaling_shape_test.ts`: 7,496 passed,
  0 failed. Render-parse 41 / 82 (baseline or below).
* Filed witnesses (`--strict`, both inventories): 4,686 as filed, 0 moved.
* rep-fuzz exact. Self-lint and fmt-check clean. Late demands 6 (baseline 6). plumb-shape fuel
  main +0.5%, tail −0.8% (bar +5%); peak RSS main +0.6%, tail +0.1% (bar +10%). Seed size +0.2%
  over its baseline.

## Left

Step 7's pre-index walk is gone. What still mints before the type indices reads checker tables:
`ambientCtorCalls`, `isListArmNodes`, `fnTagArmCalls`, `arrNewAtTop` and the if-joins.
