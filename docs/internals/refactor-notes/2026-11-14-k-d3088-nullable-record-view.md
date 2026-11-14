# D3088: a nullable record row delivered as a readonly union list is its twin's view, 2026-11-14

Lane K, bucket (f). Closes D3088. Files D16334 and D16335 (clause 1), found grading D16310.

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
- **The 20 templates naming `readonly`, `regress.vl`, deno and the fast gates:** see the PR.

## Found on the way (clause 1, not fixed here)

- **D16334:** a result of `use(lap)`, where `lap` calls its own parameter, set into an
  un-annotated map and bound, reads back `null`.
- **D16335:** the same result is accepted at any annotated type. `const s: boolean = use(lap)` is
  check-clean and prints `true`.

The check leaves the call's result an open hole when the lambda argument's parameter is fixed only
by the callee's own body. A direct call `lap((a) => a * 10)` is typed `i32`. Handed to the
coordinator, since it is the elaboration's typing of a call through a value of one known member.
