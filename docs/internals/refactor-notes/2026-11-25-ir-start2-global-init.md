# START-2: global initializer nulnone if and widen join (2026-11-25)

Census restricted to the classes' programs, master d37f1f18:

| class | before | after |
|---|---:|---:|
| global initializer nulnone if | 2 | 0 |
| global initializer widen join | 2 | 0 |
| null unit read rep (moved in) | 0 | 1 |

- `nulNoneBoxPayload`: a `null`-typed `if` initializer is `ifForEffect` then the bottom null, as
  `emitNulNoneBoxPayload` writes it. `conditionals/if-join-null-first-arm.vl` moves on to a
  `boolean | null` global built from an all-null `if` (`null unit read rep`).
- The `widen join` skip existed only to copy legacy's inner-join adoption byte for byte; the IR's
  per-arm widening prints the same (ir-parity: behaviour equal), so the skip and
  `widenJoinKeepsInner` go.

Parked: `global initializer variant coercion` (`types/canonical-field-order.vl`, a `Dot` stored
into a `Circle` arm cell, the same struct by canonical field order). A local is claimed (plain
record retag); the global's cell is the variant row, and neither `recRowRetag` nor `recSubAdmit`
admits a plain record into a variant rep, so it needs a verifier-checked retag of its own.

Parked: `for range slot`. Letting a repeated copy of a range loop (an outer loop legacy partly
unrolls) reuse its slots' variables claims `loops/break.vl` and `lists/index-guard-in-range.vl`,
but it also claims `bench/arrays/push-known-size`'s `m4Mul`, where the IR opens the inner loop's
hoist prologue (the invariant `a`/`b` field reads) in each copy, while legacy hoists them once above
the nest. The output is the same; the `-O3` module grows 2034 → 2117 bytes, past the release-shape
band (±61). Claiming it needs the IR's hoist placement to match legacy's across unrolled copies.
