# IR: `is` at its storage, the remaining box arm tags, and the cut behind a written guard (2026-11-23, lane IR-N1)

Part 2 of the `is` family (claims broadcasts #8 and #11): `is storage rung`, `is arm tag boxLitSet`,
`is arm tag memNarrow` and `is arm tag memVariant`. It also widens part 1's block cut to the guard
whose test is written.

## What landed

- **Any rung at its storage** (`storedBoxTest`): legacy's `storage` arm runs `emitIsTest` under
  the storage-read mark. The builder now runs its ordinary `isRung` under the same mark for every
  rung but the tag ones it already built there. `notIs` (a staged receiver or a content check)
  stays the named miss.
- **`RLitArms` at storage**: the lowering asks `isPreArmOf` and re-enters the storage mark around
  the literal arm. Its plan check (`litIsArmOf`) and its tails then read the receiver at its storage
  as legacy does.
- **`boxLitSet`**: legacy writes each member's `emitUnionLitIs` over the box's string payload, or-ed.
  That is the `boxLits` arm's writer over the same lexes (`litIsBoxLexes`), so the builder builds
  an `RLitArms` at `boxLits`. The lowering's plan check takes it where the arm-tag rung names
  `boxLitSet`.
- **`memNarrow` and `memVariant`**: the tag is the pattern's arm tag. `memVariant` reads the
  variant's box field at its storage, as `memStruct` does.
- **The written guard's cut**: `guardEndsBlockWith` also cuts where the instance decides the head
  guard true (`monoStaticIsGuardOf`) though its test is written, not folded to a constant. The
  head `if` is built whole, then the cut trap.

## Legacy tails the IR calls

- `isPreArmOf` (`emit_plan_union`): the `RLitArms` lowering asks it to set the storage mark.
- `tagIsArmOf` (`emit_plan_union`): the `RLitArms` plan check asks it for a `boxLitSet` test.

## Bytes and coverage

- Self-compile `--names`: identical 9,037, differ 0. `--cases`: identical 7,720, differ 0.
  `--claimless`: identical 14,044, differ 0. `tests/cases` A/B: same 8,835, differ 0. The moved
  list is empty. Mode 3 self-compile is byte-identical to legacy.
- `tests/cases` armed shadow: covered = matched goes from 79,282 to 79,321; start covered from
  6,829 to 6,837. `is storage rung` 23 → 0 and start 6 → 0, `is arm tag boxLitSet` 8 → 0,
  `memNarrow` 9 → 0 and start 2 → 0, `memVariant` 5 → 0 and start 1 → 0. Next blockers reached:
  `is literal member str at nullable` +3, `narrowed field unbox rep` +2, `narrowed read` +1,
  `start is member storage rep` +1.
- Corpus: `is arm tag boxLitSet` 9 → 0. Functions with no blocker go from 45,451 to 45,460 of
  45,678; covered = matched 45,460.
- Row: `tests/ir-shadow-rows/is-storage-rungs-and-arm-tags.vl`. On the base seed it shows
  `is storage rung` ×2, `memNarrow` and `boxLitSet`; on the head, 4 of 4 functions matched.

## Fuel

The gate reads L2 +0.11% per PR on base ff34a69e. That base is master under part 1 (#9742, +0.04%
of its own). Against part 1's tree (a17e821c, L2 120,920,084,876), part 2 is +0.068%:
- The storage-rung commit: +62.6M (+0.052%), in the code payload phase (6b, +0.06G). That is the
  compiler's own new code, not a new walk; check-side phases are equal.
- The arm-tag commit: +19.4M (+0.016%).
