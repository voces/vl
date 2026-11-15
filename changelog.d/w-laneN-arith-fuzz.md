## Codegen, memory & runtime (Track B)

- **D16560 closed (clause 1):** a value `if` or `match` of literals nested as a tail of a join with an `i64` value (`if c { if c { 1 } else { 2 } } else { k }`) built an invalid module; the nested join now takes the width its literals adopt. Found by the arith fuzz (`ar_s11_0195`).
