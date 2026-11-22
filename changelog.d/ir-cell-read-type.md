## Codegen, memory & runtime (Track B)

- **IR coverage: a capture cell's `c[0]` the rewrite leaves untyped**, such as the value of `return k = "ww"` where `k` is a captured literal-union or function binding. It now holds the cell's element type, through `cboxElemTyOfCell`, which is split out of the capture-box rewrite and asked by both sides. This removes most of `rep ?`.
