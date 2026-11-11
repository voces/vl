# D15651: a record of a named function beside a hole handed two named functions, 2026-11-11

Clause-2 close. Base is master `aa9f3a34` (#7171).

## What was wrong

D15640's close keeps `{ f: dbl }` at `{dbl}`'s set only when every call of `both` hands `g` the
one function the record names (`hfbHandsNamed`, check_calls.vl). `both(dbl); both(inc)` hands
`{dbl}` and `{inc}`, so the record was built at a closure, `call0`'s `f64` instance from `both`
called a closure, and `dbl` handed to `both` had no call fixing it at `f64`.

## The change

`hfbHandsNamed` accepts every hand that names a function, whichever it is. Each `both` instance
takes its own set, `call0` is instanced per set, and the late decision decides each set with its
hole's.

## Why the gate can go now

D15640's lane measured 177 runs → not-runs without it. On master before #7171 the same rule
still loses 162 of the 2,220-program grid below. #7171's two rules remove them: a forwarded
record field's set reaches the late decision (D15649), and literals of one set's record in two
functions share one row (D15701).

## Graded (scratch grids, against `aa9f3a34`)

| grid | programs | → runs | runs → not-runs |
| --- | --- | --- | --- |
| record/list combinations, a binding of `{ f: dbl }` or `{ f: idf }` | 1,728 | +40 | 0 |
| record value × binding position (`const`, `let`, argument, returned, two) × hand order | 2,220 | +103 | 0 |
| two hand-on functions sharing one callee | 768 | 0 | 0 |

**Not reached:** a hole handed a function that is also returned in a record elsewhere
(`hand1(tri)` beside `mk() { return { f: tri } }`), refused as on master; and the annotated
face of `record-field-named-function.matrix.vl`.

**Proof run locally.** refresh, the witness and fixture, the corpus oracle (`cases_wasm_0..3`),
the record matrix, `check-filed-witnesses --strict` on both inventories, distilled `regress.vl`,
lint-self, the static budgets, seed size, late demands, the inventory tests.
