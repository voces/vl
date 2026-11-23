# IR: the `recordFit` rung over legacy's writer, through `fitRecvReadHook` (2026-11-23, lane IR-N1)

Stacked on #9672, whose hook this reuses; the coordinator ruled it its own PR.

## What landed

- **`recordFitPlanOf`** (`wasmEmit`): how `emitRecordFitIs` answers `is` test `isIx`. It returns
  0 when the test is not that shape (the next rung), -1 when the writer refuses before it writes
  (no narrowed field, a nullable record that is no nullable reference, a layout or a field tag it
  cannot test, a literal field its storage cannot compare), 2 when it stages a receiver that is
  no re-readable place, and 1 when it writes over a re-readable one. The builder builds only 1, so
  it never calls a writer that refuses (D17051's hazard).
- **`emitRecordFitRecv`** reads a receiver held in no slot through `fitRecvRead`, as the variant
  chain's readers do (#9672). Legacy bytes are unchanged.
- **`RRecordFitIs {rfV, rfAt}`** in the `record` family, over a variable (`is record fit
  receiver` otherwise; the verifier holds the same line). The lowering is `irFitTail` with
  `record`, which calls `emitRecordFitIs` itself with the hook set.

## Legacy tails the IR calls

- `emitRecordFitIs` (`wasmEmit`): the whole recordFit writer, called by `irFitTail` for an `RRecordFitIs`.
- `fitRecvReadHook` (`wasmEmit`): now also `emitRecordFitRecv`'s receiver read, set by `irFitTail` while the writer runs.

## Bytes and coverage

- `--names`: self-compile identical. `--cases`: differ 0. `--claimless`: differ 0. `tests/cases`
  A/B: same 8,787, differ 0. The moved list is empty.
- The order check reads 0 order rows over the corpus (12,304 programs) and `tests/cases` (8,787).
- `tests/cases`: `is rung` 7 functions fall to 0. Covered = matched goes from 71,277 to 71,284.
  The corpus and the self-compile census are unchanged.

## Fuel

L2 self-compile, same-tree: base 115,512,317,939 (#9672), head 115,686,935,034 (+0.151%). By phase,
checkProgram rises 0.11G and code payload 0.03G; every other phase moves by 0.01G or less. That is
the cost of compiling the new source, mostly `recordFitPlanOf`.
