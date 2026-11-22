# IR: an untyped capture-cell read holds the cell's element (2026-11-22, lane IR-D1)

`rep ?` on the IR-only census (69 rows) is an expression node with no type at all. A probe at the
miss classed the rows by node kind:

- 37 `index` rows, every one a `c[0]` the capture-box rewrite minted (pos -1) whose receiver
  reads a capture cell (`cboxReadsCell`). The rewrite leaves three kinds untyped on purpose:
  - a store target;
  - its `spillWrite` re-read, which copies the untyped target (`nodeTyCarry`);
  - a function-typed read.
- 8 `member` rows, a separate family.
- 5 singletons.

Ablation from `closures/captured-litunion-assign.vl`. The family needs all three:

| ingredient | outcome |
| --- | --- |
| the assignment's value used (`return k = "ww"`) | without it, claimed |
| a captured cell | at module scope, `global read coercion` instead |
| a literal-union or function element | with `string`, claimed; with `i32`, other misses |

## The change

- `cboxElemTyOfCell(cellTy) = tyArrayElemIx(cellTy)` (emit_rewrite.vl), split out of the rewrite's
  vector-cell arm, which now calls it. The seed is byte-identical.
- The IR's `exprTyOf` gives an Index with no type, whose receiver `cboxReadsCell`, the type
  `cboxElemTyOfCell(nodeTyAt(receiver))`. It tests the cheap conditions first: no type, then an
  Index node.
- New test case `closures/captured-cell-assignment-value-printed.vl`: a literal-union cell and a
  cell of functions, assigned through a closure and the value printed or called.

The measurements are in the PR body.
