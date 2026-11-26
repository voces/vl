# A list field of a stored row is walked at the row's element (lane CENSUS, 2026-11-26)

**Mechanism.** A `for` over a list read off a record held at its storage row (D14426) — the list's
rep is the stored row's field, not the field type's own rep — was refused up front (`for in
stored-row receiver`). The walk already takes the list's element rep from the list it reads
(`rlsElem`) and declares the loop variable at it (`irBLoopVar`, refusing `for in variable rep` where
the variable cannot hold it), so the up-front refusal is removed and the walk is built as for any
list.

**Reading** (census probe on master's fixpoint seed; class programs only, regen-10 — 2 distilled
programs, both `@init`):

| | before | after |
|---|--:|--:|
| programs with the unit | 2 | 0 |
| of those, claimed under `VL_IR_REQUIRE_CLAIM=1` | 0 | 2 |

Each prints what master's seed prints.
