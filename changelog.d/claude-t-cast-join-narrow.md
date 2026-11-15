## Type system (Track A)

- **A narrowing cast over a join with a wide radix tail runs again:** `(if c { 0 } else { 0x1FFFFFFFF }) as? u8` (or `as i32`, `as! u8`) widens the join to `i64` and misses, as ruling 4.3 says, instead of refusing "does not fit a 32-bit destination". #8363 had given narrowing targets the destination's adoption step; only a widening cast (`i64`, `f32`, `f64`) takes it now.
