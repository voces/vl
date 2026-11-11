# D15694: a field read of a record built elsewhere is built as that record's field, 2026-11-11

Clause-1 close. Base is D15690's branch (#7153) over master `e0d19181`.

## What was wrong

`const r = { ys: [mk2()] }; for y in r.ys { print(y.f ?? 0) }`, with `mk2` kept at
`J = { f: i32 | null }`. `r` is built at `{ys: J[]}`. `forInVarStructIdx` asks `listRowOfExpr` for
the iterated list's row, and that reads `exprRepTy`. `exprStoredRepTy` answered a binding read, an
index read and a call, but not a member read. So `r.ys` had no rep, and the loop variable fell back
to the slot of the checked element `{f: i32}`. That is no struct row: `y.f` failed with `field
access receiver is not a struct`, and an unused loop variable failed with `ref valtype with no
interned shape`.

## The fix (emit, emit_classify.vl)

`exprStoredRepTy` has a member arm. A field read is built as its receiver's rep's field, when that
is a list of records or a record. A record answer is what lets `r.a.ys` reach its list.

## Graded

| cell | master | here |
| --- | --- | --- |
| `for y in r.ys`, `const zs = r.ys` then `for`, a list binding in the field | emit error | runs |
| `for y in r.a.ys`, inside a function, a second field read in the body | emit error | runs |
| `y.f = 5` through the loop variable, an empty body | emit error | runs |
| `for y in p.ys` with `p: P` annotated, a literal list with no kept call | runs | runs |
| `r.ys.map(…)` or `xs.map(…)` | emit error | emit error, D15697 |
| `const k: J = y` in the body | check reject | check reject (`y` is `{f: i32}`) |
