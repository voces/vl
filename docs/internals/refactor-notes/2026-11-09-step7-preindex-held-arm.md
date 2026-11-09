# Step 7: what `preIndexMintTrees` still mints, and its held arm deleted (2026-11-09)

Base: master `67329a97` (#7021). Both seeds are fixpoints (two self-compiles, byte-identical).
The population is the sweep's 23,814 programs.

## The measurement

Two instruments, one per question.

* **Which arm mints first.** A probe seed sums every row table and usage flag the pre-pass can
  write (`sNames`, `rlElemName`, `mvValName`, `uVariants`, `unTyIx`, `uDeclared`, the `vb*Used`
  flags, `fnValUsed`, `vbBoolListTop`). It compares the sum before and after each arm of
  `preIndexMintAt` and calls `emitFail` with the arm's name when the sum moved. Control: an
  un-annotated `Map()` program fires `call`, and `print(1 + 2)` fires nothing. Only a program's
  first refusal is recorded, so each program counts under the first arm that minted in it.
* **Which of those rows a later reader mints in time.** One one-level seed per arm with that arm
  deleted, swept against base.

| arm | programs where it mints first | runs lost without it | new traps |
| --- | --- | --- | --- |
| held node (`heldRepOf`) | 106 | **0** | 0 |
| `is K[]` test | 6 | 3 | 0 |
| if-expression join | 18 | 9 | 0 |
| a signature's annotations | 862 | 3 | 1 |
| call | 1,631 | 423 | 111 |

The held arm's 106 programs all have a later first reader (#7020's `heldRepOf` readers) that
mints the same rows, so the arm only moves them earlier.

What each other arm still owns:

* **`is K[]`** (3): D4962, D4994 (`this is arm reads an empty list at an element type it was not
  built with`), `generics/is-list-arm-anon-record.vl` (`ref valtype with no interned shape`).
* **if-expression join** (9): D1745, D1767 (`union atom has no value box`), D2823 and six more.
  The usage flags are read when the box types are dealt, so a late mark is too late.
* **signature annotations** (3 + 1 trap): D3059 (covariant list delivery) and
  `closures/paren-classify-homes.vl` (invalid wasm in `useMapArm`).
* **call** (423 + 111): mostly an un-annotated `Map()`/`Set()`'s value slot (`unsupported map
  value type`). This is #6965's 128-program class, and it has grown.

## What changed

`preIndexMintAt` no longer calls `heldRepOf`. Seed 6,595,664 → 6,595,631 (−33).

## Proof

* Sweep against base: 23,811 same, **0 runs → not-runs, 0 new traps, 0 output movers**, and 3
  bytes-only movers (`named/d15208_map_cb.vl`,
  `closures/hole-fn-generic-map-stored-through-parameter.vl`,
  `closures/list-of-untagged-records-returned-beside-a-called-set-runs.vl`). Each was built on
  both seeds and run through `wasm-dis`. Each is the same size, and the two disassemblies are
  identical once indices are renumbered and lines sorted. These are type-index reorders.
* Oracle (`cases_wasm_*`): 7,387 passed, 0 failed.
* Filed witnesses (`--strict`, both inventories): 4,679 as filed, 0 moved.
* rep-fuzz exact. Late demands 6 (baseline 6). Render-parse 41 / 82 (baseline or below).
  plumb-shape cost ok (fuel; CPU not graded on this box). Seed size +0.1% over its baseline.

## The mint-order dependence (#7020's twin order)

Diagnosed with a logging seed on
`const rss = [[{ fs: [inc0] }]]; const lists = [[{ fs: [[inc0]] }]]` with
`heldRepMintUnder` disabled:

* In the working order, the inner list literal mints first. It interns its element at the
  record literal's `#anon` row, whose recorded type is the literal's own,
  `{fs: ((_) => _)[]}`. The ref-list key is `repElemId` of that type.
* In the failing order, the outer literal mints first. It reaches the same element through the
  held rep, `{fs: i32[]}`, and interns it keyed by `repElemId({fs: i32[]})`. That is another key
  for the same record, because the holed function type is not "tagged" (`fnTagTyIsTagged`). So
  the `elem` key does not fold `((_) => _)[]` to the i32 list the way it folds a tagged set's.
* For `{fs: i32[]}`, `rlElemStructRow` still finds `#anon0`. For `{fs: i32[][]}` every rung
  declines (srow −1), because `repRowOfTyStruct` compares canonical ids and the `#anon1` row's
  type keeps the function. So the list's element heap is written as 0, and the module is
  invalid.

The order-dependent key is the record element key: `repElemId` of the literal's holed record
type and of its held rep disagree, and so do the struct-row lookups on them. The fix belongs in
the key or in the anonymous row's recorded type. Neither is in this PR.
