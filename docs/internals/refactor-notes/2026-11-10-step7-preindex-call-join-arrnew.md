# Step 7: the call arm's join atoms and top-level array intrinsic leave `preIndexMintTrees` (2026-11-10)

Base: master `77ecbc93` (#7057). Both seeds are fixpoints (two self-compiles, byte-identical).
The population is the sweep's 23,832 programs.

## The call arm, split by sub-case

`collectACallMint` did three things for each call the walk reached. Each was disabled alone in a
one-level seed built by the base seed, and each seed was swept against base:

| sub-case | runs → not-runs | new traps | message |
| --- | --- | --- | --- |
| whole call arm disabled | 409 | 111 | |
| a tagged-set call's join atoms (`markInferredJoinAtoms`) | 12 | 0 | `union atom has no value box` |
| `Map()`/`Set()` value slot (`mvShapeOfMapNodeTy`) | 396 | 111 | 278 `unsupported map value type`, 102 invalid wasm at top level, the rest scattered |
| `__array_new__` outside a function (`collectArrNewIntr`) | 1 | 0 | `ref valtype with no interned shape` (`intrinsics/array-new-ref-elems.vl`) |

12 + 396 + 1 = 409, so the sub-cases do not overlap. The 111 traps are all `Map()`/`Set()`
programs, and each is also a lost run.

## What changed

The two small sub-cases are now read from tables the checker writes, at the walk's slot:

* **Join atoms.** `fnTagArmCalls` (`check_elab_cap.vl`) lists the calls `fnTagArms` records
  with arms on a tagged set. `markTagCallJoins` marks each call's union. The box types are dealt
  with the type indices, so this is the same constraint as the if-join (#7039). A call whose
  type still holds a type variable is skipped, because that is a template's call.
* **Top-level array intrinsic.** The checker already recorded the array-intrinsic calls inside a
  function (`arrNewInFn`). It now records the others too (`arrNewAtTop`, `check_decl_scan.vl`).
  `arrNewTopRowsMint` interns their pairs.

`collectACallMint` keeps only the `Map()`/`Set()` arm.

## Measured

* Sweep against base (both one-level builds by the base seed): **23,832 same**, 0 bytes-only
  movers, 0 runs → not-runs, 0 new traps.
* Seed 6,601,060 → 6,601,740 (+680); seed size +0.2% over its baseline.
* Filed witnesses (`--strict`, both inventories): 4,686 as filed, 0 moved.
* Oracle (`cases_wasm_*`), inventory refs/rows and `vl_scaling_shape_test.ts`: 7,496 passed,
  0 failed. Render-parse 41 / 82 (baseline or below).
* rep-fuzz exact. Self-lint and fmt-check clean. Late demands 6 (baseline 6). plumb-shape fuel
  main +1.2%, tail +0.1% (bar +5%); peak RSS main +0.5%, tail +0.1% (bar +10%).

## Left in `preIndexMintTrees`

The `Map()`/`Set()` value slot.
