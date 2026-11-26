# A row-less receiver's field is read off its storage row (lane CENSUS, 2026-11-26)

**Mechanism.** A record whose own type is never laid out (`structIndexOfExpr` -1: an inferred
`{ r: i32 }` returned through a generic identity, beside a `J | string` destination of the same
call) is held at its storage row (D14426). `storedRowKid` required that row to be the expression's
struct row or its twin, which a row of -1 never is, so the read refused (`field read of a stored
row`). Such a receiver is only ever held at its storage row, so its field of the name is that row's.

**Reading** (census probe on master's fixpoint seed; class programs only, regen-10 — 7 programs
carry `field read of a stored row` or its `'s box` variant):

| | before | after |
|---|--:|--:|
| `field read of a stored row` programs | 3 | 0 |
| of those, claimed under `VL_IR_REQUIRE_CLAIM=1` | 0 | 3 |

Each prints what master's seed prints. Not covered: the 4 `field read of a stored row's box`
programs, whose stored kid is a nullable wider value (`f: i64 | null` read as the expression's
`i32`, or as a box): a conversion, not a row lookup.
