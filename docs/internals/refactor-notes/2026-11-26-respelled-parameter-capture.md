# IR: a respelled parameter's seed, passed to a lifted callee and read in its frame (lane COV-CLOS, 2026-11-26)

When a nested function reads a parameter `g` and is reached through another nested function whose
own parameter is `g` (D3025), the shadow respelling copies the parameter into a respelled local at
the top of the body (`let g$sN = g`), which the captures read. The IR missed both halves of that
frame: a direct call into the lifted callee found no binding for the capture `g$sN` (`liftCaps`
searches the callee's reads, which resolve to the parameter), and a read of the parameter whose
wasm local is the seed's found no parameter at that index (`local rep`). The capture now falls back
to the binding legacy reads by name in this frame (`cloEnvBoundVar`, as `cloEnvOf` already does),
and a parameter read takes the variable holding its local (`paramOrSeedVarAt`).

## Measurements

I8 census over the `tests/cases` programs, the new position test among them (base at master
`a515f2d31`, head on it): `callee captures` 5 → 0. Claimed functions 98,446 → 98,451, unclaimed 260 →
255, claimed starts 8,525 → 8,525, claims fallen back 11 → 11; 0 claimed functions or starts lost.

`scripts/silent-sweep/distilled/regress.vl` on the head seed: no runs lost (0 of 261,224 cells).

`VL_IR_REQUIRE_CLAIM=1 vl run` on `closures/sibling-capture-beside-shadowing-param.vl`: every body
claimed (14), printing its logs.

Q58 position sweep (`tests/cases/closures/respelled-parameter-capture-positions.vl`: through a
lambda, a named function, two deep, an `i32` parameter, in a loop): base declines four bodies
(`callee captures`, `local rep`), head claims every body, output identical on both seeds. A write
to a reference-typed parameter so respelled builds an invalid module on both seeds and is filed as
D17674.
