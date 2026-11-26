## Codegen, memory & runtime (Track B)

- **IR covers an `as?` over a union box written after another operand (lane COV-UNION):** `mem.g(sh as? Circle)` and its siblings were refused on a guard the lowering never needed. The cast is an inline temp, and its tag test's valued `if` sits legally above an earlier operand on the wasm stack.
