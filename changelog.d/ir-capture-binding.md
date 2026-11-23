## Codegen, memory & runtime (Track B)

- **IR coverage: a union-box capture read at a narrower union's box.** For example, a `"a" | i32 | null` parameter narrowed to `i32 | null` and read in a closure or a lifted function. Legacy's `capture` arm writes the env read alone, and the IR now reads the capture as the same box (`RStage`), as it does a narrowed box local. `capture binding` 7 → 6 tests/cases functions. No legacy bytes moved.
