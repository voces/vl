# D15861: a bundle holder handed to a plain function's annotated parameter, 2026-11-12

A holder of a returned bundle (D15749) may be handed to a parameter that one member of its record
fits. `elabHandMemberOf` (`emit_elab.vl`) found that member through the callee's instance key,
and a plain function with an annotated parameter has none. The hand was therefore a read the
holder could not account for, and the holder's call was refused. Where the callee has no
instance, the member is now the one at the named function's annotated closed parameter type
(`elabPlainParamClosedFn`). Only mono's pin paths told emit which member a hand takes
(`bundleHandMemberNote`), and a plain callee is not pinned. The direct-call argument path now
asks the elaboration for it (`elabCallHandMemberAt`) where mono noted none.

## Measurement

| program | master | this |
| --- | --- | --- |
| D15861 | loud emit reject | runs, `5` `4` |
| the holder handed at both members (`u(k)`, `w(k)`) | loud emit reject | runs, `5` `8` `4` |
| handed twice with another argument | loud emit reject | runs, `5` `2` `5` `3` |
| a module-scope holder | loud emit reject | runs, `5` `4` |
| `u(f)` un-annotated (D15212) | runs | runs, the same |
| `u(f: (string) => string)`, which no member fits | check reject | the same |
| D15862, D15863 | loud emit reject | the same |

Sweep over the whole population, with fixpoint seeds on both sides and the base at `a0e195a9`:
same 24,041, bytes-only 0, output movers 1 (D15861: emit_reject → runs), runs → not-runs 0, new
compiler traps 0.
