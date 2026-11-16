## Type system (Track A)

- **D16494 narrow targets** (ruled: exact value, then wrap): a radix tree under `as% i32` or `as% u8` was computed at 32 bits, so `(0xFFFFFFFF / 2) as% i32` printed `-1` and `(0xFFFFFFFF / 256) as% u8` printed `0`; it is now computed exactly and wrapped, printing `2147483647` and `255`. The oracle grades both targets.
