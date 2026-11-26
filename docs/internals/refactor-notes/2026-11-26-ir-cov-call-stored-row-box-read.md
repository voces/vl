# IR: a field read off a stored row's wider `T | null` (2026-11-26, COV-CALL)

This is the records part of the "place reads at storage" series, starting with the class CENSUS
routed to it (coordinator ruling 2026-11-26).

**Mechanism.** Take `type J = { f: i64 | null }; const o = mk2(); const d: J = o; print(o.f)`.
Here `o` is held at `J`'s row, so the field read finds the stored row's kid (`storedRowKid`).
That kid is `i64 | null`, while the read's own kid is `i32`. The read owns its value, and neither
`boxRead` nor `boxUnbox` matched, so it missed. Legacy's field tail, which the lowering already
writes for this node, takes the stored value past its null and narrows it to the read's own rep.

The new `nulUnbox` arm admits a stored `T | null` kid under a read whose rep is its own kid's (`kr
== rep`), where that rep is either:

- a scalar from a scalar (`i64 | null`, `f64 | null` read as `i32`); or
- the read's own box (D3403's `f64 | string | null` read as `i32 | string`).

**Census delta.** Regen-10's `field read of a stored row's box` class (4 programs, all `@start`)
is now claimed, and each runs under `VL_IR_REQUIRE_CLAIM=1` with legacy's output:

| program | output |
| --- | --- |
| `soundness/binding-of-call-built-at-wider-number-read-at-own-type-runs` | `7 7 7 7` |
| `soundness/record-built-at-nullable-converting-field-read-at-own-type-runs` | `4 1 4 1` |
| D15716's witness | `7` |
| D3403's witness | `4`, `i` |

**Q58.** `tests/cases/records/stored-nullable-wide-field-read-at-own-scalar-positions.vl` reads the
stored field in five positions: a print argument, a binding, an operand, a call argument and a
return. It does so at `i64 | null` and `f64 | null`, inside a function and at top level.

- Master's probe: `@start` misses `field read of a stored row's box`.
- The branch: builds under `VL_IR_REQUIRE_CLAIM=1` (rc 0) and prints legacy's output.
