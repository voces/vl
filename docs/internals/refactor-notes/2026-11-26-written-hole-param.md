# IR: an assigned parameter is written at its own variable (lane COV-CLOS, 2026-11-26)

An assignment to a name resolves its target's variable (`irBDeclVar`), which serves a `let`'s
declared local; a parameter has no declared slot, so assigning an un-annotated parameter (`a = dbl`,
`n = n + 1`) missed `local slot`. A read of a parameter already resolves it to its own variable
(`paramVarAt`); the assignment now does the same.

## Measurements

I8 census over the `tests/cases` programs, the new position test among them (base and head at
master `903f71519`): `local slot` 8 → 0 unclaimed functions, every one claimed (`take` and `later` of
`list-of-hole-param-written-after-listing.vl`, `t3` of
`as-cast-hole-param-coalesced-written-or-guarded-runs.vl`, the position test's five). Claimed
functions 97,863 → 97,871, claimed starts 8,434 → 8,434, claims fallen back 16 → 16; 0 claimed
functions or starts lost, no other class moved.

`VL_IR_REQUIRE_CLAIM=1 vl run` on `tests/cases/closures/list-of-hole-param-written-after-listing.vl`
and on the position test: base fails (`local slot`), head runs with every body claimed.

Q58 position sweep (`tests/cases/functions/written-hole-param-positions.vl`: written then called,
written in one `if` branch, a scalar written from itself, written in a loop, written then returned):
base 5 functions miss, head 0; output identical claims-off and on.
