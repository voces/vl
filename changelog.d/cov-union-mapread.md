## Codegen, memory & runtime (Track B)

- **IR builds a map read whose receiver is computed (lane COV-UNION):** `(o ?? mk())[k] ?? d` and `(if c { a } else { b })[k] ?? d` take the receiver's value where its `??` or valued `if` leaves it, read first in order, where the IR refused before (`map read receiver computes`).
