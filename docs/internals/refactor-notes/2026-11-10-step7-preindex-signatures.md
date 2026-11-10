# Step 7: a signature's annotations leave `preIndexMintTrees` (2026-11-10)

Base: master `cc8c522e` (#7038). Both seeds are fixpoints (two self-compiles, byte-identical).
The population is the sweep's 23,821 programs.

## What changed

* **`preIndexMintAt` has no `FuncDecl` arm.** The tree walk no longer mints a signature's
  return and parameter annotations.
* **`fnSigRowsMint` mints them where the type section's reads are dealt.** The type section is
  their first reader, after the type indices, so `emitModule` asks for each `fnStmts` function's
  annotations just before the indices (and before the shared helpers, so `rvWanted` sees them).
  This is a read of the function table, one function at a time, not a tree walk.
* **The closure-signature collector forces a result map's value slot before it keys the sig.**
  `collectTyReachCloSigsArm` (a signature or union arm reached through a function type) and the
  nullable-closure pass in `collectCloSigs` call `forceCloResultMapTypes` before `sigKeyOfTy`,
  which reads that slot. They run before `emitModule`, so the deal-time mint is too late for them.
* **The checker records the element type of each `readonly` view delivery** (`refViewDstTys`,
  beside `refViewSrcTys`). `rvWanted`, the first reader of that union-box list's row, mints it.

## What each part owns

The 2026-11-09 ablation lost 3 runs and 1 trap without the arm. Each was rerun on one-level
seeds built by the base seed:

| program | arm deleted, nothing else | owner |
| --- | --- | --- |
| D3059 (`readonly Shape[]` parameter) | `covariant list delivery` refusal | `rvWanted` mint (also `fnSigRowsMint`) |
| `closures/paren-classify-homes.vl` (`useMapArm`) | invalid wasm | `collectTyReachCloSigsArm` force |
| rep-fuzz `p1c`/`p1r` `((i32) => {[string]: f64}) \| null` | `no interned signature` | `collectCloSigs` nullable-closure force |
| rep-fuzz `p2c`, an unused `{[string]: f32} \| null` param or result | type section wrote more entries than allocated | `fnSigRowsMint` |

Two placements were refused on the way:

* Forcing a closure result's **list** as well as its map in `collectTyReachCloSigsArm` lost
  `soundness/list-element-narrowing-row-copy-runs.vl` (invalid wasm). The walk roots every
  lifted lambda's own type, so it forced a `K[]` of a literal union. Only the map is forced.
* Minting the closure arms' results from `collectAUnionRows` covered a union arm but not a
  nullable closure.

## Why views move

Before, whether a `readonly` record-list delivery was built as a view (D3041) or as a snapshot copy
depended on whether some annotation had minted the union-box list row before the helpers were
reserved. A `readonly Shape[]` parameter did. A `const b: readonly Shape[]` local did not. Now
the checker's record decides, so the four programs whose destination is a `readonly` local build
the view.

## Measured

Seed: master `cc8c522e` 6,598,554 → 6,598,900 (+346).

* Sweep against base (both one-level builds by the same seed): 23,663 same, **0 runs → not-runs,
  0 new traps, 0 output movers**, 158 bytes-only movers. Each was built on both seeds and run
  through `wasm-dis`:
  * 154 are the same size, with identical disassembly once indices are renumbered and lines
    sorted. These are type-index reorders: a signature's rows now mint after the frame passes'.
  * 4 now build the `readonly` view and its three helpers (+101 to +228):
    D2214, D794, `arrays/widen-source-row-per-shape.vl`,
    `unions/list-covariant-escape-unrelated-field-write.vl`.
* Oracle (`cases_wasm_*`) and inventory refs/rows: 7,400 passed, 0 failed.
* Filed witnesses (`--strict`, both inventories): 4,681 as filed, 0 moved. D14041 and D14042
  refuse as filed.
* rep-fuzz exact. Self-lint and fmt-check clean. Late demands 6 (baseline 6). Render-parse
  41 / 82. plumb-shape cost ok (fuel; CPU not graded on this box). Seed size +0.1% over its
  baseline.

## Cost: an un-annotated `Map()` of a deep function mints under its declared name

Without the arm, `ci-cost`'s `diamond record depth` read fuel 9.77 (bar 4.45; base 4.37). Neither
suspect named at hand-off moved it: dropping the walk arm's force read 9.77, and dropping
`fnSigRowsMint` read 9.77. Restoring the arm read 4.37. A guest profile of the 15-level file put
the excess under `preIndexMintAt` → `collectACallMint` → `mvShapeOfMapNodeTy` →
`mvShapeOfValNameTys`, on `tyTopIndexOf` and `tyHasSepByte`.

`const m: {[string]: ((x: A12) => i32) | null} = Map()` is the `Map()` call's first reader now.
Before, `g(m: {[string]: …})`'s annotation minted the slot under its declared name
(`mvDeclNameOfValTy`), and the call found it by type (`mvDeepFuncSlotOfTy`). On a miss the call
minted under `mapNodeValName`, the render, which spells each shared sub-record once per path.
`mvShapeOfMapNodeTy` now mints a function value deeper than 8 under its declared name, with the
same types, so it is the same row the annotation minted. Its finds are by type.

* Fuel: 71,757,799 / 16,441,914 = **4.36**. `tests/vl_scaling_shape_test.ts` 90 passed.
* Fixpoint (second refresh byte-identical); 6,598,956 bytes.
* `regress.vl`: no cell changed class. Oracle 7,392 passed, 0 failed. Filed witnesses 4,681 as
  filed. rep-fuzz exact. Late demands 6. plumb-shape cost ok. Self-lint and fmt-check clean.

## Left in `preIndexMintTrees`

The `is K[]` arm (a record `K` with no row yet) and the call arm.
