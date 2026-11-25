# COV-CALL: a list read whose index is a valued `if` (2026-11-25)

Lane COV-CALL, class `index valued-if operand`.

## Mechanism

In `xs[if c { 0 } else { 1 }]` (or `fs[if c { 0 } else { 1 }](4)`), legacy writes the receiver ahead
of the index's valued `if`. `buildIndex` refused any receiver below such an `if` (`ifBelowLeadOf`).
It now stages the receiver below it (`irBStageLeads`). When staging inserts the receiver's root,
`idxRowOpenNote` marks that root as the read's row open, so the spans agree with legacy's.

## Census (`CENSUS_CLASS=classes/index-valued-if-operand.txt`, rows)

| row | before | after |
|---|---:|---:|
| `index valued-if operand` | 7 | 0 |

The class programs are byte-identical to the base seed under `VL_IR_STRICT=1 VL_IR_SHADOW=6`.

## Proof

- **Q58 sweep:** `tests/cases/lists/index-valued-if-staged-receiver-positions.vl` covers a `let`, an
  argument, a return value, an interpolation and a call through a function list's element, over a
  local and a parameter receiver. On master 3 of its functions miss on this row; with this change
  none, and all match.
- A record-field or module-global receiver already shows a `spans: read index` mismatch on master
  (a span difference, not a miss). It is left out of the sweep.
- `tests/ir-shadow-rows/tag-dispatch-statement-expression-callee.vl` now expects no
  `index valued-if operand` row; it pinned 2.
