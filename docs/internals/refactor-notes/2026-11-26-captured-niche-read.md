# IR: a captured union box read as its niche (lane COV-CLOS, 2026-11-26)

A union binding `w: F | null | string` narrowed past `string` reads as its niche-repped `F | null`
(legacy's `niche` arm, `emitNarrowedNicheRead`: the box at its storage, then the niche tail). A
local read already builds that (`RNicheRead` over the variable); a capture of `w` read inside a
closure missed (`read of w`), since `captureRead` took only the `capture` and `unbox` arms. It now
reads the box as the capture holds it (`capturedAsHeld`) and applies the same niche read
(`captureNicheRead`).

## Measurements

I8 census over the `tests/cases` programs, the new position test among them (base and head at
master `6ab5ac7c5`): `read of w` 6 → 0 unclaimed functions, every one claimed (the `__lambda_0` of
`narrowed-nullable-closure-out-of-union-box-positions.vl` and of
`narrowed-nullable-map-out-of-union-box-positions.vl`, the position test's four). Claimed
functions 97,982 → 97,988, claimed starts 8,457 → 8,457, claims fallen back 11 → 11; 0 claimed
functions or starts lost, no other class moved.

`VL_IR_REQUIRE_CLAIM=1 vl run` on both witnesses and on the position test
(`tests/cases/closures/captured-union-box-niche-read-positions.vl`: a lambda reading the closure
niche, a nested named function, two lambdas deep, the map niche read in a loop inside a lambda):
base declines (`read of w`), head runs with every body claimed; output identical claims-off and
on.
