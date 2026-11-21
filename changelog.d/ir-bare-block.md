## Codegen, memory & runtime (Track B)

- **IR coverage: a bare block mid-body.** `drwBareBlock` rewrites `{ … }` into `if true { … }`. The checker never types that `true`, so the builder missed at `rep ?`. Legacy writes the block's statements in place, as it does for a written `if true`. The builder now builds an untyped boolean literal as a bool, and the decided condition does the rest.
