# List `+`: a widened side (2026-11-25, lane COV-CLOS)

This is the class `list concat widen`. Legacy's list concat (`emitListConcatG`) builds a side that
`catWidenSideOfBin` names at its own narrower list, then widens it to the concat's element: a
scalar list converted element-wise, or, at a ref concat (`LBK_REF`), a list boxed into the
union-box row as a boxing spread's group is. The IR refused every `widen` route.

## Mechanism

* `catScalarWidenTail` (wasmEmit) is split out of legacy's `emitCatOperand` with no behaviour
  change. `catWidenTail` picks it, or `spreadBoxedGroupTail` at a ref concat.
* `catWidenTakes` admits the route, except a side the boxing builds at the row itself (a run,
  `spreadBoxedGroupIsRun`).
* `RListCat.ljWiden` names the side. The verifier accepts a list operand at another rep there, and
  the lowering writes that side's tail in place of `listCatOperandTail`.

## Census (master → head, 11,500 files)

| | master | head |
|---|---:|---:|
| claimed functions | 114,503 | 114,507 |
| lost | | 0 |
| `list concat widen` | 5 | 0 |

Gained: `cw` (concat-each-list-rep), `cat` and `__lambda_0` (list-concat-widen-operand; its
`@init` too), and `@start` of union-list-concat-numeric-member-widened.

Q58: `tests/cases/lists/concat-widened-side-positions.vl`. `catF`, `catU` and `run` miss this
class on master and are claimed here; the output is the same claims-off and claimed.
