# IR: a shadow-arm `is K[]` whose name a closure reads (2026-11-24, lane IR-N1)

`is empty fit shadow capture`: #9805 refused a shadow arm whose name a closure in the function
reads (`liftedFnCaptures`, or `closureReadsName` over the nested functions). The guard protected
nothing. The closure's read is its own function's, built as that function's capture, and the outer
function's env capture reads the binding, which no shadow row applies to, as legacy's does. This PR
removes the guard and `closureReadsName`; `grep -rn closureReadsName compiler scripts tests` finds
none. `liftedFnCaptures` is private to `wasmEmit` again.

## Legacy tails the IR calls

- None new.

## Proof of the guard removal

- `tests/ir-shadow-rows/is-empty-fit-shadow-capture-shapes.vl`: a closure made before the `is`
  and called after it, one made inside the arm and called after it, and two closures capturing the
  same name. Base: 9 of 12 covered, 3 capture misses. Head: 12 of 12 matched. Every shape prints
  the same under the base seed, head claims-off and head claims-on (`0 10 1`, `20 1`, `30 1`), and
  the claims build is `cmp`-identical to claims-off.
- The push shapes are refused on master and unchanged. A closure pushing onto the name is refused
  at check, since the arm's narrowing does not reach its body. An arm that pushes while a closure
  reads the name keeps `LIST_FIT_PUSH_MSG` on base and head alike; it is recorded as
  [D4961](../inventory/D4961.md)'s 2026-11-24 addendum, the one way a capture over a shadowed name
  still fails.
- The capture row `tests/ir-shadow-rows/is-empty-fit-shadow-capture.vl` is re-pointed from the
  named miss to covered and matched.

## Bytes and coverage

- Self-compile `--names`: identical 9,433, differ 0. `--cases`: identical 7,790, differ 0.
  `--claimless`: identical 14,460, differ 0. `tests/cases` A/B: same 8,907, differ 0. The moved
  list is empty. Mode 3 self-compile is byte-identical to legacy.
- `tests/cases`: `is empty fit shadow capture` 3 → 0; covered = matched 81,377 → 81,380. The one
  fail row (`unions/empty-list-is-store-back.vl`, `stack value read out of order`) is on base too.
  Corpus: 46,847 → 46,848 functions with no blocker, its one capture miss matched.
- Q58 sweep: `tests/ir-shadow-rows/is-empty-fit-shadow-capture-positions.vl`. A closure in the
  region reads the arm's list, delivered at a call argument (scalar and union parameter), a nested
  call argument, a concat operand, `return`, a `let` initializer, an `if` arm value, a `??`
  operand and a record field: base 9 capture misses, head 31 of 31 matched, claims byte-identical
  to claims-off, the same output. The interpolation hole is
  `tests/cases/generics/is-list-arm-closure-read-in-interpolation.vl`: 64 of 64 matched.

## Fuel

L2 −0.00% per PR on base 9f701ade.
