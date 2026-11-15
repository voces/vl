# D16333: an optional call's guard over a receiver with no null is its call, 2026-11-15

Lane K, bucket (f), clause 1.

## Mechanism

`function take(a) { print(a?.f(2) ?? 0) }; take({ f: id })`.

- `drwOptGuard` (emit_rewrite.vl) wraps the optional call as
  `if a != null { a.f(2) } else { null }`.
- `take`'s only instance pins `a` to a non-null record. So the guard's test folds to `true`, and
  the call's result, with the `?? 0` around it, is an `i32`.
- The guard's `null` arm still emitted `ref.null none` into that `i32` `if`, which is invalid
  wasm (`expected i32, found nullref`).

The rewrite runs on the template, where `a` is still a hole, so it cannot drop the arm itself.

## Change (`wasmEmit.vl`)

`emitIfExpr` asks `optGuardCallOf` first. A guard whose `else` is the lone `null` emits only its
call when either:
- its test is the folded `true`, or
- its test is `r != null` with `r` typed here with no `null`.

Pin helpers: none. Functions in `emit_mono.vl`: 908, unchanged.

## Grading

- The witness prints `2`, as do a `const` copy of the parameter and the result bound without
  `??`.
- The annotated `R | null` parameter still prints `7` and `0`.
- `fn-value-generic-optional-read.matrix.vl` and its `-open` twin: the four SILENT
  `argument`/`early_return_guard` un-annotated cells now RUN, and 0 are lost.
- Found on the way: a `null` or nullable-record argument at the same hole parameter is refused at
  check, on master too ([D16338](../inventory/D16338.md), [D16339](../inventory/D16339.md)).
