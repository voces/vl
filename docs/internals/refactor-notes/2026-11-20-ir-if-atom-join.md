# IR: a value `if` joined at an atom (2026-11-20)

`ifExprPlainWhy` refused a value `if` on `ifJoinPlanOf`'s `atom` rung (`expression if atom join`).
Legacy writes that join as `emitIfExprAs` at the `i32` blocktype, each arm its value in the atom
context: the same shape as the plain scalar join. The builder already delivers each arm at the
atom rep (a member literal as its interned id), so the rung now asks only what legacy's
`emitIfExpr` asks first, `ifJoinDropsNulAtom` on the `atom` arm. The lowering opened a valued `if`
only at a primitive's valtype; an atom out, plain or nullable at the `-1` niche (discipline 3),
now opens at `i32`.

Measured on fixpoint seeds at merge-base `48a54c094` (functions with no blocker): self-compile
19,045 → 19,056; corpus 41,774 flat. `expression if atom join` 12 → 0 alone in the self-compile
(plus 5 in combinations): 11 build, one stops at `coalesce niche litUnion`. The corpus's 16 move
to `coalesce niche litUnion`. A join whose arms are all member literals still stops before the
builder, at `pre-path atom hook`.

Legacy lines deleted: 0. Moved to `@ir`: 0.
