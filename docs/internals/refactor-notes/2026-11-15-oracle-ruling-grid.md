# The oracle grades D16410 and D16293 (a), 2026-11-15

These are two owner rulings of 2026-11-15:
- **D16410:** a call's destination type binds a type parameter that no argument binds.
- **D16293 (a):** an integer literal `let` stored a float takes the float. This is spec 4.3 applied to stores.

`scripts/oracle/ruling-grid.ts` holds one program per case, each with what the ruling makes it print, or `refused`. `tests/oracle_smoke_test.ts` holds the oracle to every case. `ruling-grid.ts check` grades a compiler `--batch` recording of the same cases.

## What the oracle learned

D16293 (a) needed nothing: the oracle already joined a `let`'s stores.

For D16410, the oracle now refuses a call to a generic function when one of its type parameters is named by no parameter that receives an argument and the call has no destination type. The call is then a type fault, the checker's "cannot infer type parameter". A destination is the expected type the call is evaluated at: an annotated binding, an annotated parameter, or an annotated return. An expected type the callee's own erasure produced (`any`) is not one.

A generic function passed bare, as in `sel(gid)` with no destination, still counts as binding. D16411 files that face as a clause-2 gap (L2: a later call of the result binds it), so the oracle runs it rather than refusing.

## Measured on master `6015bf3ed`

| population | before | after |
| --- | --- | --- |
| distilled corpus (12,101 cells) | AGREE 11,092 · COMPILED-BAD 8 · ORACLE-RUNS-REJECTED 521 · SKIP 480 | identical |
| `fuzz.sh --gen hof`, 10 seeds × 40 | AGREE 92 · COMPILED-BAD 308 | identical verdict file (`cmp`) |

The new refusal changes no verdict on either population. The 308 hof COMPILED-BAD cells are the filed D16411 and D16412 (`unsupported argument type for f in a call to sel / compose`), not new.

## The compiler against the grid

| ruling | cases | agree | what differs |
| --- | --- | --- | --- |
| D16293 (a) | 9 | 9 | — |
| D16410, no destination (`refused`) | 2 | 2 | — |
| D16410, bound by the destination | 9 | 0 | 5 trap `indirect call type mismatch` (the D16410 witness at f64, string, i64, an argument and a return); 2 are refused `cannot infer type parameter` (`mk<T>(): T[]` and `z<T>(): T \| null` at an annotated binding); 2 are a loud emit reject `unsupported argument type for f in a call to sel` (the hole-function spelling, D16412's face with a destination) |

The two hole-function cases are the un-annotated spelling of D16410's witness, `use4(sel(hdbl))` with `hdbl(x) { x + x }`. Under the ruling the destination binds `A` there too, so D16410's fix is graded on them as well as on the annotated `gid`.

Not in the grid: D9073's annotated face (`const ys: string[][] = [3].map(cnst)`), which is to be re-graded. The oracle does not model a generic passed to `.map`.
