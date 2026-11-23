## Codegen, memory & runtime (Track B)

- **IR shadow: an element read's source-map row starts where legacy's does when an earlier operand is staged below a valued `if`.** In `f(1) + [if c { 20 } else { 0 }][0]` the lowering began the read's row at `call f(1)`; it now begins at the receiver's first byte, as `emitIndexBanked` does. This closes D17060's residue and the `if-expression-arm-merge` start row, and a function-body spelling that was a claim-fail row now matches. No legacy bytes moved.
