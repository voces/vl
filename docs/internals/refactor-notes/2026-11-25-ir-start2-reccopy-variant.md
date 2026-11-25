# START-2: `pre-path coercion recCopy variant` (2026-11-25)

Census restricted to the class's six programs (five distilled named cells, D15314's witness),
master 828fc058: `pre-path coercion recCopy variant` 6 → 0; every start body claimed.

`recCopyRowAt` answers -1 for no copy row and `-2 - vi` for a union's variant row; the IR refused
both. The lowering's copy tail is legacy's `emitRecCopyInto`, which already copies over a variant
row's fields, so the guard now refuses only -1. `ir-parity --run-all`: the six programs and the
sweep `tests/cases/records/record-copy-into-variant-row-positions.vl` are byte-identical
claims-off and run alike. The sweep's `hole` position stays unclaimed on `box of a valued if`
(COV-CLOS's class).
