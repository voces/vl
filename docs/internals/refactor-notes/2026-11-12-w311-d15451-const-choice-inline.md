# D15451: a `const` choice of named functions is written into its one hand, 2026-11-12

D15450 runs a choice between a capturing nested function and a plain one handed to a hole
parameter called at two types. `emitBundleChoiceArg` builds the taken arm's record, but only
where the choice is the argument itself. Bound to a `const` first, the value had one declaration,
one closure, and mono found no single signature for it. `inlineConstRecArgs` (`emit_rewrite.vl`,
D15700) now also writes such a `const` into its one read, under two conditions. The choice's
arms must be named functions (through nested `if`s). Its conditions must read only unwritten
parameters of the enclosing function or literals (`icraChoicePure`), so evaluating it at the hand
instead of at the binding means the same thing. The read walk and the argument test are shared
with the record case (`icraReads`, `icraArgSlot`).

## Measurement

| program | master | this |
| --- | --- | --- |
| D15451 | loud emit reject | runs, `9` `a` `9` `1` |
| D15451 taken both ways (`nested(true, 9)`, `nested(false, 4)`) | loud emit reject | runs |
| a three-way choice `if c { inner } else if d { ask } else { tell }` | loud emit reject | runs, `0` `a` `0` `1` |
| D15450 (the choice at the hand) | runs | runs, the same |
| a closed choice `if c { inc } else { dec }` handed to `(x: i32) => i32` | runs | runs, the same |
| a typed choice handed to `(s: string) => string` after another statement | runs | runs, the same |
| the choice handed twice (D15773, filed) | loud emit reject | the same |
