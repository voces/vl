# Step 7 L2 §7: a list-of-lists literal keys its row by its lead inner literal's joined rep, 2026-11-11

`2026-11-11-step7-l2-arrlit-widen-key.md` (#7227) keys a list literal's row by its build element type.
Two of its movers gained an unused row: `D4874` and `arrays/list-literal-join-widening-runs.vl`. In
both, a spread source like `[[1, 2]]` beside `[[3.5]]` is built at the joined `f64[]` element. The
outer literal's stamp (`litRepTyAt(ix, -1)`, so `arrLitBuildTy`) still records `i32[][]`, while the
inner literal's rep carries the join (D4874's fix types it from the spread). The name path already
keys the leaf by that inner rep (`arrLitElemNameTpl`). This PR sits on #7227.

## Changed

- `arrLitLeadInnerRepTy(i)` is the closed rep of the lead inner literal of a list-of-lists literal.
- `arrLitMintHintTy` takes that rep as the element where the build element is itself a list. A
  build element that is a union of lists keeps the union: a first cut that did not check this added
  types in 4 programs whose element is `string[] | f64[]`, `(i32 | boolean)[] | i32`, `Json` or
  `string[] | i32[]`.

`arrLitBuildTy` is unchanged for its other callers. The gap is the outer stamp, and the one reader
that needs the join reads the inner literal.

## Measured

The probe was an `emitFail` where the inner rep changes the key. It fired in 4 programs, all spread
joins of nested literals.

| program | output | wasm types (master / #7218 / this) |
| --- | --- | --- |
| `D4874` | unchanged | 4 / 4 / 4 (#7227 alone: 10) |
| `arrays/list-literal-join-widening-runs.vl` | unchanged | 12 / 12 / 12 (#7227 alone: 14) |
| `arrays/spread-fresh-nested-literal-runs.vl` | unchanged | 17 / 17 / 11 |
| `arrays/spread-nested-literal-joined-element.vl` | unchanged | 18 / 18 / 18 |

Against the #7218 seed, #7227's 166 movers are now: 0 output changes, 106 byte-identical, 54 with
fewer types, 6 reordered and **0 with more types**.

## Proof

- One refresh, at 6,621,855 bytes.
- `regress.vl` reports no runs lost. These pass: lint-self (with the comment, ladder, sentinel and
  scan budgets), dead-export, render-parse, seed-size, late-demands, rep-fuzz (exact), `cases_wasm`,
  `vl_check_codegen` and `vl_scaling_shape`. `check-filed-witnesses --strict`: 4,722 as filed.
- The full population is graded by CI's Sweep job.
