# D15772: a `const` record read through its field beside its one hand-on, 2026-11-12

`inlineConstRecArgs` (`emit_rewrite.vl`, D15700) wrote a `const` record of unwritten parameters
into its argument only when the binding had one read. A second read through a field (`r.f(true)`)
kept the binding, a record of closures, so the callee's hand-on reached no call that fixed the
hole's type. A read `r.<field>` of one of the literal's own fields now becomes the parameter the
field holds. The one whole read is then again the only read, and the literal is written into it.
The rewrite stands down when any assignment in the program writes one of the literal's field
names (`cwFieldNameWritten`), because the record the callee mutates would no longer be the one
the local reads see.

## Measurement

| program | master | this |
| --- | --- | --- |
| D15772 | loud emit reject | runs, `5` `s` `true` |
| the second read at the direct call's type, `r.f(7)` | loud emit reject | runs, `5` `s` `7` |
| a field read bound first, `const h = r.f`, then `h(true)` | loud emit reject | runs, `s` `true` |
| a value field beside the hole, `r.k + 1` | loud emit reject | runs, `s` `5` `2.5` |
| the callee assigns `r.f = neg`, then `r.f(9)` | runs, `3` `-9` | runs, the same (not rewritten) |
| D15700's matrix (keep, k1-k8, D15639) | run | run, the same |

Sweep over the whole population, with fixpoint seeds on both sides and the base at `eb874a9a`:
same 23,997, bytes-only 0, output movers 0, runs → not-runs 0, new compiler traps 0. No corpus
program reads such a record through a field, so the new fixture is the only mover.
