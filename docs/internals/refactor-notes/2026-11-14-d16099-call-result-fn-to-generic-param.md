# D16099: a call result holding an un-annotated function, handed to a generic parameter

**Change.** Two pieces, both in `check_relate_core.vl`.

* **Binding `T`.** In `bindGenWalk`, a type parameter an earlier argument bound to an inference
  hole (`bgInferHole`: a `?`-named variable, such as a call result's own open parameter) now takes
  a later argument's closed type. Before, `g: (x: T) => R` against `inc`'s open signature bound
  `T` to `inc`'s parameter hole, and `v: 3` could not fix it. The rule is limited to `?` holes:
  applied to any type variable, it re-bound an enclosing generic's `V` to a narrowed `f64[]`
  (`generics/is-list-arm-closure-delivers-type-parameter-list.vl`).
* **Closing `R`.** `holeFnArgDecls` reads a call argument's functions from its result type's set,
  so `holeFnArgRetAt` closes `R` at the bound `T`. Without it the spellings ran, but the call's
  result stayed open, and any use of it passed check.

The defect's row named a returned choice of agreeing functions. Ablated, one returned function is
enough, and binding the result first runs; the row is corrected to that.

**Matrix.** `set-value-to-generic-fn-param.matrix.vl`, `--before/--after`: `returned_agree` goes
from emit refuses to RUNS, in both faces. 64 of 66 run; 0 runs → not-runs, 0 silent. The template
is unchanged here, since D16098 extends it.

**Fixtures.** `generics/call-result-hole-fn-handed-to-generic-param.vl` and
`generics/error-call-result-hole-fn-generic-result-misused.vl` are new.
