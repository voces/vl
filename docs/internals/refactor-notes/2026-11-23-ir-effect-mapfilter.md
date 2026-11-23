# IR: a discarded `.map`/`.filter`, 2026-11-23

Lane IR-N4. Base: master b292d7ef2. Closes the last two rows of
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

Fixpoint seeds on both sides, master b292d7ef2 against this branch, `VL_STD` the tree's:

- Armed shadow over tests/cases: matched 78765 → 78766 of 78766 covered; the fail-row diff is
  `hole-map-tail-value.vl`'s two rows.
- Self-compile: 20309 covered, matched and claimed on both; modes 1, 3 and 5 build the plain bytes,
  the same as master's.
- `ir-identity --names`: identical 9037, fail under both 3267, differ 0; self-compile identical.
  `--claimless`: identical 14037, differ 0. `--cases`: identical 7707, fail under both 68, differ 0;
  witnesses same 61, differ 0.
- tests/cases legacy A/B: identical 7420, fail under both 67, differ 0.
- Order check (mode 6): 0 order rows over the distilled corpus and over tests/cases.
- `self-ir-misses`: 0 missed. Deep nesting: 8 passed; the labelled-loop margin passes at 910 KB
  and fails at 900, as master's seed does. The arm sits in a helper (`mapFilterDropped`), since
  `node`'s frame is paid at every level of a nested lowering.
- Fuel: L2 119821051743 against master's 119821043183 on the same tree.
- `ir-shadow-cases-baseline.txt` is header-only; `claims-fallbacks.txt` drops the fall-back row
  for `hole-map-tail-value.vl`.
