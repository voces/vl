# D16410: the destination binds a type parameter only open function arguments name

2026-11-15, lane K. Owner ruling: a call's expected type binds a callee type parameter no argument
binds. `sel<A>(f: (x: A) => A)` handed `gid` (generic) or `hinc(x)` (hole parameter) leaves `A`
open at the arguments; mono took `i32`'s instance and an `f64` destination trapped (D16410), or
mono refused the hole function (D16412).

- `dstBindOpenFnTyParams` (`check_assignable.vl`), asked from `checkCallOnFuncTy` after
  `dstBindLitTyParams`: walks the destination against the generic result and binds each unbound
  name when every parameter naming it is a function type handed an open function, and no other
  argument binds a type parameter of that slot (the slot exclusion keeps
  `error-hole-fn-to-generic-fn-param-result-at-i32` on its own message).
- Out of scope: a result-only parameter (`mk<T>(): T[]`, D9073) — follow-up PR; no destination
  (D16411, D16412's `sel(hinc)(1)`) — bucket (c).

Measured on fixpoint seeds (master `ab210efa2` vs this branch): the new matrix
`generic-fn-at-generic-fn-param-bound-by-destination` moves 32 cells to runs, 0 lost; the
`d16410-accidental-default` named cells keep printing 4 and 1; D16412's nine destination faces
(`hid`/`hinc`/`hdbl` at `i32`/`i64`/`f64`) run; oracle ruling grid D16410 7 of 9 agree, the two
DIFFERs are the result-only cases. +92 compiler lines, 0 in `emit_mono.vl` (908 functions).
