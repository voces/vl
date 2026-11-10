# Step 7: an `is K[]` arm's empty list mints its row at its reader (2026-11-10)

Base: master `ce2f9fbb` (#7026). Both seeds are fixpoints (two self-compiles, byte-identical).
The population is the sweep's 23,816 programs.

## What changed

* **`listFitElemKind` mints the empty list's row.** It is the first reader of the ref-list row
  that an `is K[]` arm's empty `K[]` is built at. It asked the question reader `rlSlotOfTy` and
  declined on a miss. It now asks `rlRowMint`, the hook #6992 armed. The question readers are
  unchanged.
* **`collectAIsExpr` keeps one case.** It mints only when `K` is a record that no struct row has
  yet (`structRowOfRecordTy(K) < 0`). Every other `is K[]` leaves the pre-pass.

## Why the record case stands

With the arm deleted outright, one program is lost:
`generics/is-list-arm-anon-record.vl` (`ref valtype with no interned shape`).

* D4962 and D4994 run with the reader mint. They were the other two losses in the
  2026-11-09 ablation.
* `is { z: string }[]` narrows the receiver to an anonymous record. That record's struct row is
  read first by the function's locals at its entry: the `for e in v` loop variable, and in the
  other function the pushed `{ y: "an" }` and the `map` closure's signature. Deleting the `for`
  line or the `map` line alone still fails at function entry. Each of these is a different
  reader, and the loop variable's is a classifier body (`forInVarStructIdx`, lane w256's). Until
  the readers of a local's struct row mint it, the pre-pass mints it here.

| step | runs lost |
| --- | --- |
| `is` arm deleted, nothing else | 3 |
| + `listFitElemKind` mints the row | 1 |
| + the arm kept for a record with no row yet | **0** |

## Measured

Seed: master `ce2f9fbb` 6,597,010 → 6,597,119 (+109).

* Sweep against base (both one-level builds by the same seed): 23,816 same. **0 runs → not-runs,
  0 new traps, 0 movers.**
* Oracle (`cases_wasm_*`): 7,389 passed, 0 failed.
* Filed witnesses (`--strict`, both inventories): 4,679 as filed, 0 moved.
* rep-fuzz exact. Self-lint and fmt-check clean. Late demands 6 (baseline 6). Render-parse
  41 / 82 (baseline or below). plumb-shape cost ok. Seed size +0.1% over its baseline.
