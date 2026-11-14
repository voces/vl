# D16090: a call through a re-pointed `let` of lambdas whose results differ dispatches

**Change.** One piece in the checker, plus its guard. A lambda written to a widened `let` records a
destination row (`noteLetCstr`), its type against the binding's, which `validateLetCstrs` re-asked
at every later call and refused when the lambda's result differed at the call's types. A
declared function leaves no such row, which is why D16064 reached only declared functions.

* `letLamJudgedAtCall` (`check_assignable.vl`) skips that row at a call through the binding
  itself, when the binding's set holds the lambda; the call types the members' join
  (`holeSetCallRetOf`) and the tag decision dispatches, as for declared functions.
* `holeSetEarlyLamNote` (`check_hole_rows.vl`, cleared per program) records a lambda a call
  through a set was typed without, because the call preceded the lambda's check. Such a call is
  typed by its own callee, so its row is kept: without the guard, `print(f(1))` before the write
  built an invalid module.
* A binding returned, or handed to a named callee, still asks the row at that call: skipping it
  there built an invalid module for `ap(f, 3)`.

**Position matrix** (base → candidate):

| program | base | candidate |
| --- | --- | --- |
| witness, `run(true)` / `run(false)` | refused | `s` / `4` |
| top-level loop writing the binding | refused | `1.5` |
| three members | refused | `3 s 5` |
| `is` narrowing of the result | refused | `s! 5` |
| two parameters | refused | `1.5 7` |
| two calls at different types | refused | `s s 3 2.5` |
| members agree; a declared member mixed in | runs | unchanged |
| `f(3) + 1`; `const r: i32 = f(3)` | refused | refused, naming `i32 \| string` |
| annotated binding `(a: i32) => i32` | refused | refused |
| value seed later written with a void lambda (B2) | refused | refused |
| a call through the binding before the write (top level, function, loop) | refused | refused — D16096 |
| returned, `sel(true)(3)`; handed, `ap(f, 3)` | refused | refused — D16096 |
| a capturing member | refused | refused at the write — D16095 |

**Fixtures.** `error-written-let-of-hole-lambdas-results-differ.vl` now runs and is renamed
without `error-`. `error-written-let-of-lambdas-results-differ.vl` keeps its refusal (a call
before the write). `written-let-of-lambdas-results-differ-dispatches.vl` and
`error-written-let-of-lambdas-results-differ-join-misused.vl` are new.
