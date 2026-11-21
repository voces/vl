# IR coverage: an `is` test at the `emptyFit` rung (2026-11-21, lane IR-N1)

`emptyFit` is the biggest `is rung` sub-arm in `tests/cases`: 401 functions alone, plus 26 start
bodies. It is also 43 corpus functions and 4 in the self-compile. Legacy's `emitListEmptyFitIs` is a
try rung: it decides as it writes, and may decline to the next rung partway through. This step
splits it into one decision and its writer halves, as §10's shared-arm rule asks.

## The split

- **`emptyFitPlanOf(isIx, fnIx)`** names the arm: `decline`, `captured` (an unbound instance's
  closure capture, refused), `union` (a box or nullable receiver), `shadow` (a narrowed region reads
  the arm's list) or `loop`. It also gives the walk's slots, kind and row. A rep refusal is carried
  as `efRepWhy` and written after the shadow set, in legacy's order.
- **`emptyFitArmsPlanOf`** gives the union arm's rows, each with its tag, payload heap, walk and
  shadow flag. `emptyFitArmHead` and `emptyFitArmBody` are the writer halves around each re-read
  of the receiver.

Legacy writes from both plans. Built from the same source by the seed before and after the split,
the self-compile is byte-identical, and so is `tests/cases` (8,670 same, 0 differ).

The IR builds:
- `RListEmpty`: the receiver, then `emitListEmptyLoop`;
- `RListEmptyArms`: a box variable re-read per arm, through the two halves.

A plan that declines passes to the next rung (`isArmRank`, now exported), and a static `false`
takes the empty fit first, as `emitIsArm` does.

Named misses: `is empty fit nullable`, `is empty fit union` (a shadowed row or a refusal),
`is empty fit receiver` (no box variable), `is empty fit shadow` and `is empty fit captured`.

## Measured vs #9346's head (fixpoint seeds on both sides)

This branch stacks on #9346 (the `is` null-test rung), so the base seed is that branch's fixpoint.

| population | base | this branch |
| --- | ---: | ---: |
| self-compile functions with no blocker | 19,211 | 19,215 |
| self-compile `is rung` alone | 5 | 1 |
| self-compile claimed (mode 3) | 19,191 | 19,195 |
| corpus covered = verified = matched | 42,751 | 42,771 |
| `tests/cases` covered / matched (armed shadow) | 57,335 / 57,322 | 57,460 / 57,447 |

The self-compile's 4 were all `union` arms. In `tests/cases`, `is empty fit union` falls 317 → 1
(2 nullable left); the rest of those functions now stop at a later rung. No fail, differ or
mismatch row is added.

- **Byte proof:** mode 3 self identical; `ir-identity --names` 9,037 identical, differ 0,
  self-compile identical; `--cases` 7,556 identical, differ 0, witnesses 60 same; `tests/cases`
  A/B 8,670 same, differ 0.
- **Ratchets:** L2 fuel 104,981,539,745 → 105,233,373,776 (+0.24%); `gate.sh --fast` passed
  (lint-self, ladder sets with `EmptyFitArm` and the new fields registered, late demands, phase
  state, dead exports).
