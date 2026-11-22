## Codegen, memory & runtime (Track B)

- **IR coverage: a narrowed read of a nullable capture.** `if c != null { c[1] }` inside a closure, over a captured `c: i32[] | null`, missed at `capture binding`. The IR now reads the capture at its own rep and applies the `RRecover` a local's narrowed read uses, with legacy's `readOwesNonNullRecover`. tests/cases `capture binding` went from 109 functions to 68, and the corpus from 11 to 0.
