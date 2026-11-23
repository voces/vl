# IR: a discarded `.map`/`.filter`, 2026-11-23

Lane IR-N4. Base: master d699cfc48. Closes the last two rows of
`scripts/silent-sweep/distilled/ir-shadow-cases-baseline.txt`, both `unlowered: effect outside I1`
from `tests/cases/generics/hole-map-tail-value.vl`'s `w`.

## Change

`mk(x).map((_e) => "v")` as a statement builds `SEffect(RMapFilter)`. The lowering's `SEffect` arm
had no `RMapFilter` case and fell to `effect outside I1` while the function was claimable, so the
armed shadow failed the claim. The arm now lowers it through the list hook (`lowerMapFilter`, the
value's path) and drops the list, as legacy's statement caller writes the loop, the list, then
`drop`.

No new predicate. No legacy tail is newly called.

## Legacy tails the IR calls

- None new.

## Witnesses (master seed, then this branch)

| program | master | branch |
| --- | --- | --- |
| `hole-map-tail-value.vl` | 18 of 19 matched, one claimable fail | 19 of 19 matched |
| a discarded `.filter` in a function, `.map` in an `if` arm, in a range-loop body, at the start | 3 claimable fails, a start mismatch | all matched |

Each builds byte-identical under both seeds. `tests/ir-shadow-rows/effect-discarded-map-filter.vl`
holds the second row. A callback that captures stays uncovered (`map callback env`) on both.

## Readings

READINGS
