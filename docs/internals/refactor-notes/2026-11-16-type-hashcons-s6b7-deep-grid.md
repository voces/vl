# Type hash-cons stage 6b: a depth grid for the caps the corpus cannot reach (lane H), 2026-11-16

The 6a census (`2026-11-16-type-hashcons-s6a-cap-census.md`) graded every depth cap on 19,939
corpus files. That census missed D16730, whose cause is a budget exhausting four records deep
(`monoTyOpenUntagged`, closed by #8543). No corpus file nests that deep, so the cap never fired
there. This note measures caps against a population that does nest that deep. It is docs and one
named set; no compiler change.

## The early-return shape

A cap written `if depth <= 0 { return X }` (or `budget <= 0`) answers `X` when its walk runs out.
`compiler/*.vl` holds 196 such guards. Grouped by `X`:

- a negative answer such as `false`, `0`, `-1`, `""` or `none`: most of them. Whether "no" is the
  unsafe answer depends on the caller.
- `true` (`tyReachesHole`, `fieldStorageEq`, `fvaSlotMayDiffer`, `ftSubsetsNoteIn`,
  `tyHasLitDeep`, `fnSigNamesLit`, `monoTyOpenUntagged`, `tyDeeperThan`): the walk claims what it
  could not see.
- the input unchanged (`widenLitTyGo`, `storageNormGo`, `elabSetRepTy`, …): a builder that stops
  rewriting.

A static grade cannot tell which of these answers is wrong at depth. The grid below measures it.

## The grid

Twenty shapes, each nested 1 to 12 records or lists deep, each printing a known value: a function
field reached through the path (`fnone`, `lamleaf`, `fnparam`), a list of records whose function
fields differ in result type (`fnset`, `fnsetparam`) or agree (`fnsame`), a number or string-literal
or union leaf, nested lists, a list of records summed in a loop, a closure, a generic identity, a
parameter and a return of the nested type, a nullable, equality and an aliased write. 240
programs. The level keys never repeat a leaf's field name.

Two seeds:

- master's fixpoint seed (`812f64483`);
- a seed built from the same tree with every exhaustion cap in a function with a `depth*` or
  `budget*` parameter deepened: `<= 0` and `< 1` become `<= -48`, and a count-up limit is
  multiplied by four where the body adds one to the depth. That is 285 caps.
  `tyDeeperThan` (whose budget is the question) and `fnTagHasSplitFieldIn` (whose depth is a scope,
  6a) are left alone.

| seed | runs | rejected |
|---|---:|---:|
| master | 228 | 12: `fnset` and `fnsetparam` at depth 7 (emit, D16731) and 8 to 12 (check, D16732) |
| every cap deepened | 231 | 9: the same two shapes at depth 9 to 12; `fnone` at depth 12 |

No probe traps, builds an invalid module or prints a wrong value on either seed.

## Which cap moves each cell

Each move was bisected, file by file and then function by function, on seeds that deepen only
the named caps.

- **D16731 is `ftHoldKind` (`check_fn_tag.vl`).** Deepening it alone makes depth 7 run for both
  shapes. It answers `0`, "holds nothing", when its budget of `FT_HOLD_DEPTH` (8) runs out. A list
  of seven records around the record holding the set's field spends the budget one level short.
- **D16732 at depth 8** needs `ftHoldKind` and more than one other cap: with `ftHoldKind`
  deepened, neither half of the other 278 functions moves it.
- **D16732 at depth 9 and deeper** does not move with all 285 caps deepened, because its limits
  are not caps of this form. They are the literal path lengths (`pre.length > 8`,
  `steps.length > 8`) and the budget of 6 that every caller passes to `recordRepTyAdopt`. Lane AE4,
  which owns D16731 and D16732, lifts those with the fn-tag walks as one set.
- **`fnone` at depth 12 is held up by `tyReachesHole` (`tyquery.vl`).** It runs on master. With
  that one cap deepened, emit refuses `inc0` as a value ("cannot take the generic function `inc0`
  as a value"). The cap answers `true`, "reaches a hole", when it runs out, and that answer routes
  the program past the refusal. A full walk answers "no hole", and the refusal fires. So removing
  this cap stops a program running until the refusal's own depth limit is found and fixed.

## For the rest of 6b

- The fn-tag decision's walks (`ftHoldKind` and its siblings, the join walks, the held-rep walks and
  the literal path walks) belong to lane AE4's D16731/D16732 close. They are lifted together, and 6b
  leaves them out.
- `tyReachesHole` keeps its cap until the emit refusal at `fnone` depth 12 is fixed.
- The named set below grades every later batch on deep types as well as the corpus.

## Named set `hash6b-deep-nesting`

Twenty cells: each shape that runs at depth 12, and `fnset` and `fnsetparam` at depth 6, the
deepest that runs below `ftHoldKind`'s budget. Coordinates are in
`scripts/silent-sweep/census/hash6b-deep-nesting.json`, materialised with `census/mkset.vl` from the
grid (built in the session scratchpad, not committed). All twenty run on master and are recorded in
the baseline, so `regress.vl` refuses a change that stops one running.
