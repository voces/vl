# Step 7: `arrLitNumKind` reads the literal's recorded rep width, 2026-11-10

Round 28 (`2026-11-10-step7-classifier-r28.md`) found that the width of a list literal's
recorded rep element (`litRepTyAt`) agrees with `arrLitNumKind`'s element scan at every consumer
except 23 programs, which build different wasm with the same output. The orchestrator ruled that
the rep is the emitter's answer, and that the switch is acceptable if none of the 23 changes
output. This PR makes the switch. `arrLitNumKind` is now three lines over `litRepTyAt`, and it
goes to the census's `NOT_BLIND`, because every answer it gives is a typed reader's.

**Graded at the consumers on master `cc8c522e`.** Both seeds are fixpoints: master is 6,598,554
bytes and this PR is 6,598,039 (−515). A census with
master's seed lists the 9,204 sweep files that reach `arrLitNumKind`. Each was built by both seeds:

| result | files |
| --- | --- |
| byte-identical wasm | 9,145 |
| the same refusal | 36 |
| different wasm | 23 |

Each of the 23 was run under both seeds. All 23 print the same output.

**Why the rep's width is right.** The 23 fall in two classes:

* **The rep is wider than the scan's guess (10).** An inner literal of a nested list whose
  destination is `f64[][]`, at an `i32` element: `const xs: f64[][] = [[self]]` with `self: i32`
  (`d581_nest_f64_*`, `d591t_nest_f64_i32`, D2273, D3529, `nested-list-literal-union-element-runs.vl`).
  The checker records the inner literal at `f64[]`. The scan read the `i32` element and answered no
  width, so it built an `i32` list and converted it. The rep builds the `f64[]` directly.
* **The rep is narrower (13).** A literal whose recorded element is a value union or a nullable:
  `[[1, 2.5]]` under `(i32 | f64)[][]`, and `[[1.5]]` at a `(T | null)[][]` pin (`mty_*_arr2un_f64`,
  `capture-union-list-*`, `closure-nullable-union-elem-list-array-result.vl`,
  `list-literal-union-member-stamp.vl`, `narrowed-place-arm-delivery.vl`,
  `nested-array-literal-into-recursive-union.vl`, D1016, D2394, D2395, D2396). The scan read an
  `f64` member and built an `f64` list, which was then boxed. The rep is the box list, and it is
  built directly.

In 21 of the 23 the wasm is smaller, by 3 to 39 bytes. `narrowed-place-arm-delivery.vl` is the
same size, and `mty_par_arr2un_f64.vl` is 14 bytes larger.

**Census:** 28 → 27 probed (all post-only, no warnings). The width read is a `_`-less `match` over
`PrimName`, so `kind-ladder-incomplete` stays at its baseline. The new seed graded the 59 files
that were not byte-identical, plus 600 sampled from the rest, with the same results.
