# Step 7: an `is K[]` arm's row leaves the `preIndexMintTrees` walk (2026-11-10)

Base: master `3b51c582` (#7055). Both seeds are fixpoints (two self-compiles, byte-identical).
The population is the sweep's 23,832 programs.

## What changed

* **`preIndexMintAt` has no `IsExpr` arm.** The tree walk mints only calls now.
* **The checker records each `is` test whose type is a list of records** (`isListArmNodes`,
  `check_list_union.vl`), at the two places it banks an `is` type (`isVarTyIxSetAt` and
  `recordClonedIsVarTyIx`, the monomorphized clone's). `isVarTyIxSet` empties it with the column.
* **`isListArmRowsMint` reads that record at the walk's slot**, just after it, ahead of
  `collectMapFilterUse`. Each node is asked through `nodeMintOnRead`, as the walk asked it, so
  `collectAIsExpr` decides as before which arm is owed an empty `K[]` (D4911, D4912).

## Where the first reader is

Without the arm, `generics/is-list-arm-anon-record.vl` fails: `ref valtype with no interned
shape`. Two later slots were tried before the walk's own slot:

| mint placed in | result |
| --- | --- |
| `collectLocalsIf`, over the condition's `is` nodes | the type section writes more entries than allocated: the locals pass runs after the indices are dealt |
| `emitModule`, beside `fnSigRowsMint` | `.map/.filter callback signature is not interned`: `collectMapFilterUse` keys a `.map` callback over the arm (`v.map((e) => e.z)`) and reads the row first |
| just after `preIndexMintTrees` | runs |

## Measured

* Sweep against base (both one-level builds by the base seed): **23,832 same**, 0 bytes-only
  movers, 0 runs → not-runs, 0 new traps.
* Seed 6,600,678 → 6,601,060 (+382); seed size +0.2% over its baseline.
* Oracle (`cases_wasm_*`) and render-parse: 7,398 passed, 0 failed. Inventory refs/rows pass.
* Filed witnesses (`--strict`, both inventories): 4,686 as filed, 0 moved.
* rep-fuzz exact. Self-lint and fmt-check clean. Late demands 6 (baseline 6). plumb-shape cost
  ok (fuel; CPU not graded on this box). `vl_scaling_shape_test.ts` 90 passed.

## Left in `preIndexMintTrees`

The call arm.
