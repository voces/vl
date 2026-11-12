# D15883: a returned record literal is judged at its field's binding, as a returned binding is, 2026-11-12

This closes D15883, a clause-1 row: check-clean, then refused at emit with `object literal field
count does not match struct`. The orchestrator ruled the fix is containment. The record path must
refuse with the same predicate as the direct path, not a copy. Lifting both spellings to runs is
w308's lift family.

## Mechanism

A tErr probe in `holeSlotCallJudgeAt` (`check_relate_core.vl`), on a scratch compiler:

- For `return xs`, `holeSlotRetJudge` refused, at the path `[] / f`.
- For `return { a: xs }`, at the path `a / [] / f`, it answered false. The fallback then read
  the two values apart (`elem` = 1), so the program was accepted.

`holeSlotArgJudge` had no arm for a record literal.

## What changed

`holeSlotArgJudge` judges a record literal as the value of the field the path's first step
names, at the rest of the path. `xs` then reaches the binding arm that refuses the bare return,
and the sentence is the same one. An inline list in the record still reaches the array-literal
arm, read apart, so it runs as before. So does D15804's loop over an inline list.

## Witnesses

Two error fixtures under `tests/cases/closures/`:

- `error-hole-fn-records-of-different-results-bound-then-returned-in-a-record.vl`, the row's
  witness;
- `error-hole-fn-records-of-different-results-returned-in-a-nested-record-and-looped.vl`.

The pushed and bound-record spellings get the same refusal (`cannot write` for the push).

## Measurement

This can move outcomes, from emit rejects to check rejects, so the sweep is CI's under the
`sweep` label.
