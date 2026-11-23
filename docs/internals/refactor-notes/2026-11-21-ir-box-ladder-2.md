# IR: an integer literal-union value boxed under its base scalar (2026-11-21, lane IR-N2)

The `box ladder` census at 568e22a3, split by the boxed value's rep (sole-blocker functions over
the corpus files): list 38, i32 14, record 13 (+21 with other blockers), v128 9, nullable 8,
others 9. This note takes the i32 rung.

Each witness boxed an integer literal-union value (`type LN = 1 | 2`, narrowed past its `null`)
into a union, as `sLN`'s `toString(v)` does. `holeBoxPlanOf`'s scalar tail read the value's
primitive with `tyPrimNameOf`, which returns null for a literal union, so the plan took the
ladder. Legacy's atom kind (`coerceValueAtomKind`) reads it as `i32`. The tail now reads
`tyScalarBasePrim`, the one home for "the base scalar a type reps as". A string literal union
never reaches the tail, since its atom rung comes first.

Corpus covered = matched 44588 → 44596 (+8), tests/cases matched +8, no new fail rows. The v128
rung needs a vector atom kind the plan's scalar range does not hold, and is left.

Row file `tests/ir-shadow-rows/int-literal-union-boxed-as-base.vl`; witness
`tests/cases/literal-unions/int-literal-union-boxed-as-its-base.vl`.
