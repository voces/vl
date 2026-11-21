## Codegen, memory & runtime (Track B)

- **IR coverage: an un-annotated function's result rep is legacy's functype result.** The IR took the checker's inferred result type before the recorded one (`fRecRetTy`), which is the one legacy's functype names. Where a fresh literal is built at the record its one call delivers it to, the two differ, and the returned value missed at `return coercion`. `resultTy` (`ir_build.vl`) now prefers the recorded result.
