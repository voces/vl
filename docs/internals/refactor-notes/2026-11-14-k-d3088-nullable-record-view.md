# D3088: a nullable record row delivered as a readonly union list is its twin's view, 2026-11-14

Lane K, bucket (f). Closes D3088.

## Mechanism

`Circle[]` delivered as `readonly Shape[]` (with `Shape = Circle | Sq`) is the container rule's.
The element changes storage, so the delivery is a view (D3041), and the record covariant-write
rule shares no handle (`rcwContainerRuleDomain` answers true). `(Circle | null)[]` as
`readonly (Shape | null)[]` asked the same question of the nullable elements. The source element is
not a bare record and the destination is a nullable union, so the answer was false. The rule then
walked the source's handles, met the lambda that captures the parameter, and refused ("a handle
to it reaches a function literal, which this check cannot follow"). A plain function returning the
parameter has no such handle and already ran.

## Change

`rcwContainerRuleDomain` peels `null` off both elements before its record-into-union test. A
nullable record row is its non-null twin's row for the container rule. Two lines, in one function.

## Grading

Fixpoint seeds on both sides, `--before` master `4b94dbf0`.

- **The witness** prints `1`. The view shows a write made to the source after the delivery: length
  `3`, then `4` and `9`.
- **New `nullable-record-list-as-readonly-union-view.matrix.vl`:** the six capture cells (an
  annotated and an un-annotated lambda, and a write after the delivery, in both faces) move to
  RUNS. 56 of 56 graded, with 0 runs→not-runs and 0 silent.
- **The 26 templates naming `readonly`:** 0 runs→not-runs.
- **`regress.vl`:** 0 of 12,013 distilled cells change class.
- **Other gates:** `deno task test` 8,946 / 0. rep-fuzz is exact, and lint-self is clean.
