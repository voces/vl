# A store whose value is another field or element store is built (lane CENSUS, 2026-11-26)

**Mechanism.** `a.f = b[i] = v`: a store whose right side is itself a field or element write
used as a value. The builder skipped it up front (`store of a field or element write`, on the
reasoning that legacy writes the inner store into the outer's value through a parked scratch
frame). The inner write already builds as a value (`print(m[k] = 9)` claims), and the outer store
built from it lowers to legacy's bytes, so the skip is removed (`assignToGo`, `writesPlaceValue`
deleted).

**Reading** (census probe on master's fixpoint seed; regen-11 — 2 units):

| unit | before | after |
|---|---|---|
| `element-or-field-write-value-in-any-position.vl` `@start` | skipped | claimed, byte-matched |
| `map-entry-write-value.vl` `@start` | skipped | `map store value store` |

The second is a map entry store whose value is a store, a separate refusal the skip masked. Each
program prints what master's seed prints.

New case `tests/cases/expressions/chained-place-store-positions.vl`: element into field, field into
element, `f64` and `string` places, and a three-place chain in a function body; every unit claimed
and byte-matched, and the program runs under `VL_IR_REQUIRE_CLAIM=1`.
