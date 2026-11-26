# A closure returning a parameter stamped at another row is built at that row (lane COV-CLOS, 2026-11-26)

D17577: inside a `filter` callback keyed at its list's build row `J`, `const e = () => y` returns the
callback's parameter, whose reads are stamped at `J` (D17660's close), while `e`'s checked result is
`{ f: null }`. Its closure signature (`cloRetResultTy`) and its declared result columns
(`criColsFromRecorded`) both came from the checked type, and `e().f` was refused (`field access
receiver is not a struct`). Both now read `fnRetStampedRowTy`: the record row every returned value
is stamped at, where each is a read of a parameter (the function's own or a captured one) and the
row differs from the recorded record. Moving only the signature built an invalid module; moving
the declared columns too is what makes the two agree.

The rule is narrow on purpose. Applied to any returned name read, it moved functions returning a
local `const` record and lost 9 IR claims (`rowless-literal-at-variant-arm-in-each-position.vl`,
`maker-list-literal-at-union-member-row-into-generic-positions.vl`); applied to any returned value,
it built invalid wasm for a returned object literal of closures (the distilled `d15221_opt*` cells).

## Measurements

I8 census over the `tests/cases` programs, the new position test among them (base at master
`ef7f197b3`, head on it): claimed functions 98,286 → 98,295, unclaimed 277 → 276, claimed starts 8,506 →
8,507, claims fallen back 11 → 11; 0 claimed functions or starts lost; `member record` 2 → 1 (the
one left, `soundness/record-list-call-spread-beside-wider-part-runs.vl`, is on both seeds).

`scripts/silent-sweep/distilled/regress.vl` on the head seed: no runs lost (0 of 261,224 cells).

D17577's witness: refused on the base seed, runs on head printing its `Want`, every body claimed
under `VL_IR_REQUIRE_CLAIM=1`. `callback-param-capture-at-build-row-positions.vl`: claimed, unchanged.

Q58 position sweep (`tests/cases/closures/callback-param-returned-by-closure-at-build-row-positions.vl`:
the result read at once, bound first, from a `map` callback, two closures deep, inside a function):
refused on the base seed, runs on head. Every body is claimed but the function's `filter`
callback, which misses `convert list -> list` on both seeds without the closure (a local list
filtered inside a function), another class. `show(e())` into a `J` parameter is a check reject
(`e()` is typed `{ f: null }`) and is left out.
