# D15485: a `??` over a generic function value folds to the value, 2026-11-12

`drwWalk` (`emit_rewrite.vl`) folds `x ?? d` to `x` when the checker typed `x` without `null`. It
left every operand whose type holds a type variable to the instance (D4170), because an instance
may pin `T` to a nullable type. A generic function value's type holds its own parameters' type
variables, yet the value is a function in every instance and never null. The fold now takes an
operand whose type is a function type whatever its parameters hold. Before this, such a `??`
reached `emitCoalesce`, which has no lowering for it.

## Measurement

| program | master | this |
| --- | --- | --- |
| D15485 (`const r = a ?? id`, `r(2)`) | loud emit reject | runs, `2` |
| `r` handed to `run<U>(f: (x: U) => U, u: U)` | loud emit reject | runs, `2` |
| `r` handed to `run(f: (x: i32) => i32, u: i32)` | loud emit reject | runs, `2` |
| `r` handed to an un-annotated `run(f, u)` | loud emit reject | runs, `2` |
| `xs[0] ?? id` over `const xs = [id]` | loud emit reject | runs, `2` |
| `r(2)` and `r("s")` | loud emit reject | runs, `2` `s` |
| an un-annotated `id(x)` | loud emit reject | runs, `2` |
| `f ?? id` over `f: ((x: T) => T) \| null` | loud emit reject | the same (D4341) |

Sweep over the whole population, with fixpoint seeds on both sides and the base at `83529fcb`:
same 24,009, bytes-only 0, output movers 1 (D15485: emit_reject → runs), runs → not-runs 0, new
compiler traps 0, and the new fixture only in the candidate.
