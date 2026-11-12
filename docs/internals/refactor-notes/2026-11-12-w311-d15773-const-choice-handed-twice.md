# D15773: a pure `const` choice handed twice is written into each hand, 2026-11-12

`inlineConstRecArgs` (`emit_rewrite.vl`) wrote a pure `const` choice of named functions into its
call argument only when the binding had one read (D15451). With two hands the binding stayed
one closure, which a hole parameter called at two signatures could not take. The choice's
conditions read only unwritten parameters or literals, and its arms are named functions, so
evaluating it once per hand means the same as evaluating it once at the binding. Each read that
is a positional argument of a named call (`icraHands`) now takes the choice: the first hand takes
the node itself and each further hand a fresh copy, typed as its source (`icraChoiceCopy`).

## Measurement

| program | master | this |
| --- | --- | --- |
| D15773 (`both(g)` twice) | loud emit reject | runs |
| handed to two callees called at different types, taken both ways | loud emit reject | runs |
| a three-way choice handed twice | loud emit reject | runs |
| handed once in a loop | runs | runs, the same |
| a hand beside a direct call `g("z")` (D15776, filed) | loud emit reject | the same |
| D15451's fixture and the closed and typed choices | run | the same |
