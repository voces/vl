# IR: a ref list read whose element stays nullable (2026-11-21, lane IR-N3)

`index ref nullable element` was `listIdxPlainWhy`'s refusal of a ref list read when
`listElemStaysNullable` holds for its receiver. Legacy's `refListGetTail` keeps such an element at
`(ref null …)`, with no recovery and none of the non-null path's retag or place unbox. It recovers
only where the index place is narrowed non-null (D451).

## The change

- The refusal is gone. The builder reads a ref element at its nullable rep as before, or at the
  inner rep when `listReadProvedNonNull` holds for the place. Legacy's tail asks that predicate
  too, so the two take one decision.
- The verifier admits an element read recovered at a nullable element's inner rep for any
  element, not only a string.
- The lowering writes `refListGetTail`, which it already called for every ref read.

## Witness

`tests/ir-shadow-rows/index-ref-nullable-element.vl`: a `(R | null)[]` element read into a local,
and the same read under an `xs[1] != null` narrowing.

## Measured (fixpoint seeds of master 568e22a3 and the change)

- tests/cases armed shadow: covered and matched +100 (65,665 → 65,765), start +19.
  `uncovered index ref nullable element` 117 → 0, start 26 → 0. `index element coercion` 42 → 43:
  one function whose read now reaches the element rep check. No new `fail` or `mismatch` row.
- Corpus: `index ref nullable element` 19 → 0; no-blocker 44,577 → 44,596 of 45,678.
- Legacy: tests/cases A/B identical 7,312 (differ 0), `--names` identical, mode-3 self
  byte-identical. L2 fuel −0.02% per PR on base 568e22a3.
