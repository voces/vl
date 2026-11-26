# A walk over a packed sub-word list binds each element as an i32 (lane CENSUS, 2026-11-26)

**Mechanism.** `for x in xs` over an `i8[]`, `i16[]` or `u16[]` reads each packed element
widened to an i32, as legacy's walk declares the variable. The builder widened only a `u8[]`'s
element (`er`), so it declared the variable at the packed rep and the first read of it at its
i32 use missed (`narrowed read`). The builder and the verifier's walk rule (rule 2, `SForIn`) now
both widen every packed element (`repSubWord`), the predicate the struct paths already use.

**Verifier rule changed (rule 2, `SForIn`).** A list walk's variable is a local at the element
rep, an i32 for any packed sub-word element (was: for a `u8` element only). Controls
(`ir_selftest.vl`, graded by `tests/vl_ir_shadow_test.ts`): `walk-list-i16-into-i32` holds, and
`walk-list-i16-into-i16` is refused; under the old rule the two answered the other way round.

**Reading** (census probe on master's fixpoint seed; regen-11 — 2 units):

| unit | before | after |
|---|---|---|
| `arrays/sub-word-lists.vl` `@start` | `narrowed read` | claimed, byte-matched |
| `distilled/named/d15293_bound_returned.vl` `mk$1` | `narrowed read` | already `convert list -> list` on master |

Each prints what master's seed prints.

New case `tests/cases/loops/for-in-sub-word-list-positions.vl`: a top-level walk of each width,
a walk in a function body, a record field's list, and an indexed walk; every unit claimed and
byte-matched, and the program runs under `VL_IR_REQUIRE_CLAIM=1`.
