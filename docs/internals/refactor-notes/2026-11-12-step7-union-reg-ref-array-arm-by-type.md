# Step 7 L6: a ref-array arm slot test asks the union's type when its spelling is unbound, 2026-11-12

One of the text callers of `unionMemberTysOf` that still reach the softened key through
`unRowOfSetText` (`2026-11-12-step7-union-reg-shape-arms-by-type.md`'s list).

## Changed

`unionHasRefArrayArmSlot` takes the union's type. Its four callers each hold it: the empty-list
arm, the ref-array coerce, the list coerce and the coalesce niche tag. A member-set spelling no
row is bound to reads the row the type keys to (`unionArmMemberTysOfTy`). Only a caller with no
type, or a type that keys to no row, reads the member-set text.

## The census behind it

A probe compiler, built in the scratchpad and never refreshed into a seed, tagged each set-text
hit with its outermost caller. It read every `tests/cases` file and every distilled `cells/`
cell (9,202). This test held 22 hits in 7 programs (`f64|K[]` resolving to `K`'s row), each
from a caller holding the union's type.

## Not changed

- `unionArmTyOfAtom` (12 hits) feeds `unionArmTagOf`, a tag producer, which lane w324's exact
  tag key owns.
- `unionClosureArmName` (4) returns an atom by its index in the spelling, which a type-keyed
  row's member order need not match.
- `unionHasAtomTy` (12, behind `unMemHasAtom`) has more than twenty callers, which is its own
  cut.

## Proof

- **Local full sweep**, `sweep.vl record` with fixpoint seeds on both sides, against master
  `5e0a0ccf`:

  ```
  same                            23962
  bytes-only movers                   0
  output movers                       0
  runs -> not-runs  (blocking)        0
  new compiler traps  (blocking)      0
  ```
- **Locally:** lint-self, rep-fuzz, `cases_wasm`, the memo-generation, state-audit and scaling
  tests, emitter-state-audit, capability probes (`--live-sites`, `--floor`), splice-scan,
  seed-size, late-demands, and the dead-export and render-parse budgets.
