## Codegen, memory & runtime (Track B)

- **IR coverage: an `if` over a decided `is`.** `emitIs`'s pre-rung answers (`storage`, `tautology`, `covers`/`fits`, `prim`, `pin`) are one shared plan, `isDecidedPlanOf`, which legacy writes from and the IR builder asks. A statement `if` or `!` over a decided `is` now builds only its live arm, as legacy's byte readback does. A static `is` in a lambda or over an element read is covered. A decided guard that ends its block, or whose region reads through a fit shadow, is a named miss.
