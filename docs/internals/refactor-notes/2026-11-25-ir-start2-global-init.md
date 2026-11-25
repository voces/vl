# START-2: global initializer nulnone if, widen join, for range slot (2026-11-25)

Census restricted to the classes' programs, master d37f1f18:

| class | before | after |
|---|---:|---:|
| global initializer nulnone if | 2 | 0 |
| global initializer widen join | 2 | 0 |
| for range slot | 2 | 0 |
| null unit read rep (moved in) | 0 | 1 |

- `nulNoneBoxPayload`: a `null`-typed `if` initializer is `ifForEffect` then the bottom null, as
  `emitNulNoneBoxPayload` writes it. `conditionals/if-join-null-first-arm.vl` moves on to a
  `boolean | null` global built from an all-null `if` (`null unit read rep`).
- The `widen join` skip existed only to copy legacy's inner-join adoption byte for byte; the IR's
  per-arm widening prints the same (ir-parity: behaviour equal), so the skip and
  `widenJoinKeepsInner` go.
- `forRangeStmt`: an outer loop legacy unrolls builds the inner loop once per copy; the second copy
  reuses the variables its declaration bound to the slots.

Parked: `global initializer variant coercion` (`types/canonical-field-order.vl`, a `Dot` stored
into a `Circle` arm cell, the same struct by canonical field order). A local is claimed (plain
record retag); the global's cell is the variant row, and neither `recRowRetag` nor `recSubAdmit`
admits a plain record into a variant rep, so it needs a verifier-checked retag of its own.
