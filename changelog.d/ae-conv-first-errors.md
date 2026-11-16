## Type system (Track A)

- **D16681-D16685 closed (lane AE conversion audit):** numeric-conversion mistakes now get a first error that names the fix. The lossy-number note names `as!` / `as?` (and `as%` from an integer) where a bare `as` would be refused, and a returned value gets it too; `x as i32 ?? d` names `(x as? i32) ?? d` with no dead-default finding beside it; `s as i32` over a string names `parseI32` from `std:fmt`; `x as i32 | null` names `as?`; and `round` / `Math` point at `nearest` and the bare math intrinsics.
