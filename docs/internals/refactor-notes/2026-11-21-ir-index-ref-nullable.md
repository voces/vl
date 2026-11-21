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
