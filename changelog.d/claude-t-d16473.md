## Type system (Track A)

- **D16473 closed:** a value join of literals cast to a number (`(if c { 1 } else { 0xFFFFFFFF }) as f64`) now takes the cast's context, as a typed destination does. A radix arm is now the value its digits spell under `as f64`, `as f32` and `as i64`. Before, it was the 32-bit pattern (`-1`), and `… as f64 as! i32` did not trap. A join of literals at a typed destination inside a generic body also builds now; before, it built an invalid module.
