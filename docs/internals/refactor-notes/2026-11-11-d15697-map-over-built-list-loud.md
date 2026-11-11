# D15697: a `map` or `filter` over a list built elsewhere is refused at check, 2026-11-11

Clause 1 → loud. The row stays open (clause 2). Base is D15695's branch (#7173) over master.

## What was wrong

`const xs = [mk2()]; xs.map((y) => y.f ?? 0)`, with `mk2` kept at `J = { f: i32 | null }`. `xs` is
built at `J[]`, and the callback's parameter is typed at the list's checked element `{f: i32}`.
No rule instances a lambda at a build, so the callback's signature named a record with no row:
`emitProgram: ref valtype with no interned shape`. A named `g(y: { f: i32 })` passed to `map` gave
invalid wasm. The same list handed to a generic (`first<T>(a: T[])`) was already refused at check
by `recBuiltReadRefuse`.

## The change (checker)

`recBuiltCallbackRefuse` (check_fit_rules.vl) runs once every container's build is known, from
`recKeptConflicts`. It refuses a read of a built list binding that is a `map` or `filter`
receiver, with `recBuiltReadErr`'s sentence, where the list's own element stores a field
differently from the build.

Making these cells run needs the callback instanced at the build. That is what D14532 and
`paramHeldTy` do for an annotated named function's parameter, and nothing does it for a lambda.

## Graded

| cell | master | here |
| --- | --- | --- |
| `xs.map((y) => …)`, `xs.filter(…)` | emit error | check reject |
| `xs.map(g)`, a named `g(y: { f: i32 })` | invalid wasm | check reject |
| a generic handed `xs` | check reject | check reject |
| `const ys: J[]` then `.map` | runs | runs |
| `r.ys.map(…)` through a record field | emit error | emit error (still open on D15697) |
