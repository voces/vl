## Codegen, memory & runtime (Track B)

- **Runtime helpers through the IR (§10.1(b), step 1):** `__f64_rem__`, the six string helpers and the three UTF-8 helpers are built as IR and lowered through one helper door to the same bytes their hand-written writers emitted; the writers are deleted. A raw rep (`RRaw`) and verifier rule 10 keep wasm GC references that no VL type names inside runtime helpers.
