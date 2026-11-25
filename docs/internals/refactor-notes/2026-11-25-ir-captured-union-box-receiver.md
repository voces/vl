# IR captured union box: an `is` test and its narrowed read in a closure (2026-11-25, lane COV-IS)

- **The misses**: `is box not a local` and `box receiver`. An `is` test's box receiver, and a box
  read raw for a narrowed read (`irBBoxLocal`), took a local or a module global only; a capture
  fell through to the global arm, which declines a capture.
- **Legacy**: a lifted closure's capture is its own parameter after the environment, read raw
  (`local.get`); an environment closure reads the capture's field. Either is the box itself.

## What landed

- `capturedBoxRaw`: a captured union box (`captureSlotOf`, held as a box at its binding's type) is
  the lifted function's parameter (`liftCapVar`) or the environment's field (`REnvGet`) at the
  box's rep. `irBBoxLocal` and the `identBox` test take it, and `boxTestTagOf` lets a capture through.

## How it was measured

- **The class** (`VL_IR_SHADOW=2`, CENSUS's lists at `0c946159`): these now match in full:
  `closures/capture-unannotated-empty-list-element.vl`, `generics/if-join-two-list-types-union.vl`,
  `unions/narrowed-box-list-union-reads.vl`, `unions/narrowed-remainder-binding.vl` and
  `unions/pop-union-box-captured.vl` (5 rows); and on the `box receiver` list,
  `closures/capture-ref-types.vl` (2), `functions/never-default-in-coalesce-builders.vl`,
  `unions/capture-narrowed-struct-union.vl` (3) and `unions/sibling-blocks-separated-by-optional-call.vl` (2).
  The two `narrowed-nullable-*-out-of-union-box-positions.vl` programs move on to `read of w`.
  Not this shape: a map cell's test (`maps/record-join-place-is-complement.vl`,
  `soundness/map-cell-write-renarrows.vl`) and `coalesced-arm-local-join-block-capture.vl`.
- **Q58 position sweep** (`tests/cases/closures/captured-union-box-is-test-positions.vl`, new): a
  lifted lambda, an escaping closure, a nested closure and a record union. On master 4 functions
  miss (`is box not a local` ×3, `box receiver`); here all 10 match.
