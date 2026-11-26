# Element coercions: an element that retags as it stands (2026-11-26, lane COV-START)

CENSUS's census (fcf003d9) gave COV-START the coercion family. A scan found five start units of
`array element coercion` and two of `store operand coercion`. A scratch build printed, at each
miss, whether the builder's own `retagsAsStands` test admitted the pair. Four of the five array
elements did, and one of the two stores.

## The mechanism

A call argument, a return and a field already put in a value that is a list twin, a variant
record at its struct twin, or a record on the destination's heap or a declared subtype's
(`retagsAsStands`). They retag it (`RRetag`) and take no coercion. Legacy writes such an element
as it stands too. An array literal's element and a push's value only retagged a closure that left a part open
(`holeRetagNoted`); an element store retagged nothing. All three now retag a value
`retagsAsStands` admits. The verifier is
unchanged: it re-checks each retag by the same predicates.

## Measured

| program | master | head |
|---|---|---|
| `closures/hole-fn-records-one-open-row-two-types.vl` | start uncovered | start matched |
| `structs/record-literal-beside-declared-record-with-another-field-function.vl` | start uncovered | start matched |
| `arrays/list-widening-readonly-destination-runs.vl` | start uncovered | start matched |
| `expressions/wider-record-write-into-narrower-place-value.vl` | start uncovered (store) | start matched |
| `objects/record-join-layout-prefix-runs.vl` | start uncovered | moves to `ref if arm rep` |
| `generics/generic-function-in-nullable-function-list-literal.vl` | start uncovered | unchanged (not a retag) |

- Each prints the same output on legacy and under `$VL_IR_STRICT=1`.
- `distilled/regress.vl`: no runs lost. Its movement list is identical to master's seed.
- The sweep `tests/cases/records/element-retag-as-it-stands-positions.vl` covers an inline maker's
  result, beside a maker of another signature, a local read back in a function, a two-element
  literal, and a declared subtype's record stored into an element and pushed. On master its function
  and its start body miss; on the head both are matched. Its output is the same on legacy and under
  strict IR.
