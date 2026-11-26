## Codegen, memory & runtime (Track B)

- IR valued `if` (lane COV-CLOS): a join of `v128` values (SIMD vectors) is claimed. The IR's plain scalar join already lowers at the out's own valtype; the shared plan's `valtype` refusal (`ifExprPlainWhy`, read only by the IR) is dropped. On the class's programs `expression if valtype` falls from 5 to 0: 2 functions claim and 3 move on to `index element coercion`. Over the 71 programs that use a vector type, none is lost.
