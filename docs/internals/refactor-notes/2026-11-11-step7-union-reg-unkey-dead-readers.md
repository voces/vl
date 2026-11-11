# Step 7 L6: the softened key's near-dead readers go, 2026-11-11

The softened key column (`unKey`) can go only once no lookup reads it. #7252 left it read only
through `unRowOfKeyId`. This is the first cut of the plan that retires it, and it removes the
readers that almost never find a row.

The base is #7252.

## The census behind the cuts

A probe compiler, built in the scratchpad and never refreshed into a seed, tagged every
`unRowOfKeyId` call with its caller and recorded whether it found a row. It read every
`tests/cases` file and every distilled `cells/` cell (9,202). Only hits matter: a reader that
never finds a row answers the same with or without the column.

| reader | hits | programs | type in hand |
| --- | --- | --- | --- |
| `unRowOfSetText`, via `unionRowOf` | 1,610 | 105 | 832 through `unionRowOfAB` / `unionRowKeyAB`, which hold one; 778 through `unionMemberTysOf(name)`, which holds none |
| `unRowOfSoftKey` (sites 27 and 28) | 1,543 | 420 | yes; the floor is D4320 |
| `isUNameDeclAB`, a spelling no declaration types | 1,024 | 214 | no |
| `unRowOfRecordTy`'s spelling and `null`-position rungs | 957 + 148 | 39 + 9 | yes |
| `emit_anon_fields`' softened rung | 480 | 36 | yes |
| `nameKeyRow` | 7 | 3 | (216,793 misses) |
| `unRowOfTyWide`'s `null`-position loop | 1 | 1 | yes |
| `unRowOfCanonMembers` | 1 | 1 | yes |
| `isUNameKeyAB` with no type, `unNameAdoptKeyRow`, the mint's first-row read | 0 | 0 | |

## Changed

- **`nameKeyRow` is deleted.** Every seam that fell back to it with no type, or after its type
  missed, now answers "no row": `isUNameAB`, `unionRowNameAB`, `unionMemberTysOfAB` and
  `unionHasAtomAB`. `isUNameABAt` and its `own` flag are folded into `isUNameAB`, and
  `isUNameOwnAB` is gone.
- **`isUNameKeyAB` with no type answers false.** It no longer keys the spelling.
- **`unNameAdoptKeyRow` is deleted.** `unNameAdoptTyKeyRow` with no type answers false.
- **`unRowOfTyWide` loses its `null`-position loop.**
- **`unionRowKeyAB` falls back to the spelling's bound row** (`unRowOfName`) when its type's key
  finds none, not to `unionRowOf`'s set-text key. The 39 hits that reached the key that way change
  nothing (a second commit, swept separately: 23,910 of 23,910 same).

## Kept

- **`unRowOfCanonMembers` is load-bearing.** Removing it makes
  `maps/narrowed-map-arm-delivery-positions.vl` fail to validate. Its one hit is a nested value
  union's flattened member sequence that the softened key finds and the canonical key misses:
  the query keeps a literal that the row's key softened, the census's "soft-only" class. It
  stays until the type keys agree there.

- **`unionRowOfAB` keeps the set-text key.** It answers 793 of the census's hits, in 14
  programs. Its caller (`mvValUnionRow`) reads the registry by the spelling next. Answering by the
  type's row instead moves 70 programs: 69 bytes-only and one output mover,
  `objects/record-wider-than-union-arm-boxes-under-arm.vl`. It waits for that caller to read by
  type.

## Proof

- **Local full sweep**, `sweep.vl record` with fixpoint seeds on both sides, against #7252:

  ```
  same                            23910
  bytes-only movers                   0
  output movers                       0
  runs -> not-runs  (blocking)        0
  new compiler traps  (blocking)      0
  ```

  The 7 `nameKeyRow` hits and the 1 `unRowOfTyWide` hit change nothing.
- **Locally:** lint-self (clean), rep-fuzz, distilled `regress.vl`, seed-size (+0.4%),
  late-demands (6, the baseline), the dead-export and render-parse budgets, and `cases_wasm`.
