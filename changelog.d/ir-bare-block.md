## Codegen, memory & runtime (Track B)

- **IR coverage: a bare block mid-body.** `drwBareBlock` rewrites `{ … }` into `if true { … }`. The checker never types that `true`, so the builder missed at `rep ?`. Legacy writes the block's statements in place, as it does for a written `if true`. The builder now builds an untyped boolean literal as a bool, and the decided condition does the rest. A start body's bare block stays legacy's (`top-level bare block`). The lowering's `spanClose` now scans only past the spans a node ends, so deep nesting is linear.
