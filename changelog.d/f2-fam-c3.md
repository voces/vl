## Type system (Track A)

- **Pin layer:** the list-of-lists pins of a `let`, its re-points and a record field are one depth-generic walk (`monoPinListNest`), retiring the two-level helper and the deep special case D16921 added (emit_mono.vl 908 → 905 functions); no program's wasm changes.
