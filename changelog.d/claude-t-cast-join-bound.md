## Type system (Track A)

- **D16600 closed:** a narrowing cast over a value join whose every tail its domain holds, such as `(if c { 1 } else { 0xFF }) as u8` or a `k & 0xFF` tail, now cannot fail. It runs at module scope and in a function that returns no `null`, as a bounded bare operand does. Before, it was refused as propagating `null`.
