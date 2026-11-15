## Inventory

- **D16530, D16531 filed:** two check-clean invalid-wasm cells from position matrices. One is a
  hole parameter's narrowed literal-union copy read by `??`. The other is `sel(gid)` delivered
  to a hole parameter or an open `Map` value and called at `f64`.
