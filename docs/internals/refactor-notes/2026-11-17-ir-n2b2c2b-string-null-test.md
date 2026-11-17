# IR N2b-2c-2b: a `string | null`'s null test and `print`, 2026-11-17

Lane IR-C. 2c-2a admitted `string | null` and its `??`. On the N3 seed, 41 corpus functions held
by that rep had the null test (`null test rest`) as their one other blocker, and 18 had
`print nulStr`. This step takes both through legacy's own arms. `CLAIMED` stays empty, and no
emitted byte moves.

## What landed

- **The null test's last arm is split.**
  - `nulTestArmOf`'s `rest` was seven arms of `emitNulIsNullTest`. It now names each:
    `optChain`, `mapHas`, `boxTag`, `nullRef`, `nulStr`, `instMap`, `none`.
  - Legacy dispatches on them, and its ladder ends in a named `emitFail` that no arm reaches.
  - The two nullable-ref arms share one tail, `nulTestRefTail`: `ref.is_null`, then `i32.eqz`
    for `!=`.
- **`RNulTest` takes a `string | null`.**
  - The builder admits the `nullRef` and `nulStr` arms over that rep, beside the `atom` arm
    over a `K | null`.
  - The lowering reads the arm back from the compare node and writes its tail.
  - The verifier's rule takes either niche.
- **`print` of a `string | null`** is legacy's two blocks around the raw ref:
  - `printNulStrOpen` opens them;
  - `printNulStrTail` is the `br_on_null` to the word `null`, or else the string's stream.

  `RPrint` takes the `nulStr` arm over that rep.
- `NulTestArm` grows from 6 to 12 members in `compiler/lint.vl`.

## Pins

Each is a shared witness, one covered function matching legacy and printing the right value:
- `x == null`;
- `x != null`;
- `null != x`;
- `print(x)`, over `null` and over a string.

## Coverage

The census's 41 and 18 counted functions with one other blocker each; most of those also
stop at a third, so the corpus gain is smaller than their sum.

| reading | 2c-2a | this step | gained |
|---|---:|---:|---:|
| self-compile claimed in mode 3 | 5,732 | 5,734 | +2 |
| corpus covered = matched (12,296 cells) | 24,099 | 24,120 | +21 |

## Bars

| bar | reading |
|---|---|
| self-build | fixpoint; the armed self-build is byte-identical, with the 2 mismatches 2c-2a already reports |
| corpus identity against the 2c-2a seed, 12,294 cells | 9,016 identical, 3,278 fail under both, 0 differ (so the arm split moves no corpus byte) |
| mode 3 with `list` and `map` admitted (throwaway build) | self-compile 5,734 claimed and byte-identical, the same 2 fallbacks; corpus 9,016 identical, 0 differ, 0 fell back |
| L2 self-compile fuel (`self-compile-time.sh`, each tree from its own fixpoint seed) | 94,380,806,992 to 94,398,540,067 (+0.02%) |
| seed size, 2c-2a seed to this one | 6,543,334 to 6,544,190 (+856) |
