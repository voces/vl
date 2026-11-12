# D15774: an unwritten module-scope `let` bundle holder reads as a `const`, 2026-11-12

D15863 let a module-scope `const` bundle holder be read into an annotated binding from any
function (`elabTypedReadsHold`, `emit_elab.vl`), as `elabHolderCopiesHold` already let a copy of
one. A `let` holder was left out, because a write from another function would make its record no
longer one fact. A `let` nothing writes (`cwDeclAssigned`) has no such write, so both tests now
take it as they take a `const`. A `let` holder that is written, at module scope or from a
function, is refused as before.

## Measurement

| program | master | this |
| --- | --- | --- |
| D15774 | loud emit reject | runs, `5` `4` |
| an unwritten module `let` read at both members from two functions | loud emit reject | runs, `5` `8` |
| a copy of it in a function, called at both signatures | loud emit reject | runs, `3.5` `4` |
| the same `let` written at module scope after a read | loud emit reject | the same |
| the same `let` written from a function | loud emit reject | the same |
| a module `const` holder (D15863) and its copy | run | the same |
