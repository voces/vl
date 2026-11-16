## Type system (Track A)

- **D16494 closed** (ruled: a radix literal tree under `as%` is its exact value): a radix tree under `as% i64` read its 32-bit pattern sign- or zero-extended depending on the operator, so `(0xFFFFFFFF - 1) as% i64` printed `4294967294` and `(0xFFFFFFFF * 2) as% i64` printed `-2`; every such tree is now computed at `i64` and prints what `as i64` prints (`8589934590`). The independent oracle's `as% i64` arm reads these trees instead of skipping them.
