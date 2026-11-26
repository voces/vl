## Codegen, memory & runtime (Track B)

- **IR: a function with one instance holds an open local at the rep it is built at** (`fnBuiltOnce`, as for a start body), so a local list of hole functions builds in a bundle-record program: `open local type` 4 → 0 programs in regen-10, 3 claimed under `VL_IR_REQUIRE_CLAIM=1` (refactor-notes/2026-11-26-ir-built-once-function-open-local.md).
