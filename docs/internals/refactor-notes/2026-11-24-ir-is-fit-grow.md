# IR: an `is K[]` whose arm pushes onto its receiver (2026-11-24, lane IR-N1)

`is empty fit shadow grow`, along the pre-reviewed design (byte identity, no Q57).

## What landed

- **The test** (`RListEmpty.leFit`, `listFitShadowSet` answering 2): the lowering takes the grow
  row (`listFitGrowOf`) and sets the shadow variable's slot to its local. It writes legacy's
  open (`listFitGrowOpen`: the local's null test and an `if`), the receiver and emptiness walk,
  then `listFitGrowFill`, which stores the `K[]` once the test fits and answers 1 untested after.
- **Pushes in the region** read the shadow variable as their receiver through the existing
  `RListPush` lowering, which lands on the grow local as legacy's push does.
- **`.length` outside the region** (`RListLen`): where `listFitGrowLenRowOf` names a row, the
  receiver's own length runs inside `listFitGrowLenOpen`/`listFitGrowLenClose`. That is the grown
  list's length once filled, else the receiver's, as `emitListFitGrowLen` writes it.
- `emitListEmptyFitIs`'s grow open and `emitListFitGrowLen` are split byte-neutral into those
  helpers, which both writers call.

## Legacy tails the IR calls

- `listFitGrowOf`, `listFitGrowOpen`, `listFitGrowFill` (`wasmEmit`): the grow row and the test's
  `if` around the walk.
- `listFitGrowLenRowOf`, `listFitGrowLenOpen`, `listFitGrowLenClose` (`wasmEmit`): the grown
  `.length` around the receiver's own.

## Proof against the pre-review's conditions

1. **Order**: `tests/ir-shadow-rows/is-empty-fit-shadow-grow.vl` reads `q.length` before the
   test, which fires the grow scan there. It has two grow rows (`q is f64[]`, `r is boolean[]`) in
   one function. Its claim-mode build is `cmp`-identical to legacy, and the disassembly is
   identical text: the grow locals `$12`, `$13` (ref null) are allocated in legacy's order.
2. **Grown length**: the same row prints `0` before the push and `1` after it for `q.length`
   outside the arm.
3. **The push receiver arm**: the region's pushes are identical on both sides (`array.set` into
   `$12`/`$13` through `ref.as_non_null`). The `-3` stage refusal at the push site is not taken for
   a grow-held shadow (`listFitGrowHolds`) by either writer.

## Bytes and coverage

- Self-compile `--names`: identical 9,433, differ 0. `--cases`: identical 7,771, differ 0.
  `--claimless`: identical 14,455, differ 0. `tests/cases` A/B: same 8,888, differ 0. The moved
  list is empty. Mode 3 self-compile is byte-identical to legacy.
- `tests/cases`: `is empty fit shadow grow` 4 → 0; covered = matched 80,376 → 80,380. The corpus
  is unchanged.
- Q58 sweep: `tests/ir-shadow-rows/is-empty-fit-shadow-grow-positions.vl`. The grown `.length`
  sits at a call argument (scalar and union parameter), a nested call argument, a concat operand,
  `return`, a `let` initializer, an `if` arm value, a `??` operand and a record field: base 9 grow
  misses, head 13 of 13 functions matched, claims byte-identical to claims-off, the same output.
  The interpolation hole is `tests/cases/generics/is-list-arm-grow-length-in-interpolation.vl`:
  62 of 62 matched.

## Fuel

L2 +0.01% per PR on base aa4beffc.
