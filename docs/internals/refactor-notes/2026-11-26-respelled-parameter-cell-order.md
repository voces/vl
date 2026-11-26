# A respelled parameter's capture cell is built after its seed (lane COV-CLOS, 2026-11-26)

D17674: a parameter that a nested function reads through another whose own parameter shares its
name is copied into a respelled seed (`let g$sN = g`, D3025), and a read of the parameter in the
frame is the seed's slot. Written as well, the parameter is boxed, and the capture-box pass put its
cell (`g$cb = [g]`) at the top of the body, ahead of the seed: the cell read the seed's slot before
the seed was set, and the seed read the cell. A reference-typed parameter built an invalid module;
an `i32` one read zero and ran. The cell of a parameter with a respelling seed is now put right
after that seed (`cboxRespellSeedOf`, `cboxInsert`), and the capture-box walk leaves the seed's
initializer reading the argument itself (`cboxParamSeed`), adding no arena write.

## Measurements

I8 census over the `tests/cases` programs (base at master `ecfacf50f`, head on it): `local rep` 1 → 0
(the position test's `written`). Claimed functions 98,497 → 98,498, claimed starts 8,531 → 8,531,
claims fallen back 11 → 11; 0 claimed functions or starts lost.

`scripts/silent-sweep/distilled/regress.vl` on the head seed: no runs lost (0 of 261,224 cells).

D17674's witness and its ablation's variants (a named `inner`, an `i32` parameter, no write, an
unshadowed inner parameter): each runs on head with the right output and every body claimed under
`VL_IR_REQUIRE_CLAIM=1`; the witness was an invalid module on the base seed.

`tests/cases/closures/respelled-parameter-capture-positions.vl` takes the written position back
(`written`): an invalid module on the base seed, claimed and printing `w` `x` `w` on head.
