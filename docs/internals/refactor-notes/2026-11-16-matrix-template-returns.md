# Position-matrix templates: tail-expression bodies take `return`, 2026-11-16

Lane WIDTH. This changes no compiler code. The tail-expression rule (a block body returns a value
only through `return`) left most templates under `scripts/capability-probes/matrix/` grading a
refusal of their own helper functions rather than the capability under test.

## What changed

Each function in a template whose one-line body, or whose last statement, is a bare expression
now has `return` before that expression: 368 templates, 703 lines. Four templates are untouched
because the tail expression is what they test (`dead-tail-after-exit*`, `dead-tail-inferred-*`).
One line was left as it was: `function h(q) { show(q) }` in `record-param-width-*`. With
`return` it loses its `hole_fwd` cell, because a void call returned through a hole parameter is
refused.

## Measurement

Each template was graded twice on the master fixpoint seed, once as it stood and once rewritten.
The grades were compared cell by cell.

| | as it stood | rewritten |
| --- | --- | --- |
| cells that run | 3,501 | 18,507 |
| cells lost (runs → not-runs) | | 0 |
| new SILENT | | 4: D16708 (`coalesce-hole-call-litunion-join`, `argument`); D16709 (`same-rep-maps-{i32,i64,string}-i32-bool-neg`, `early_return_guard`) |
| new program traps | | 0 |

`record-literal-widened-alias-read-back` still runs no cell. Its rot is a different one: the
alias of a literal the map store re-seats at `{ v: f64 }` now reads as `f64`.
