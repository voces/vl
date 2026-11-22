# IR: a box local read at another box-shaped rep (2026-11-22, lane IR-N3)

The coordinator ruled the box-narrowing residue of `narrowed read` to IR-N3. Ranked by an
instrumented miss on master 47b9d7bb, its rows were a `T | null` box (disc 4) narrowed to a smaller
nullable union (`own=N:box rep=N:i32`, 16), a union box read at a nullable union's box at a cell
(`box → N:box`, 11), and the same at a record (5). All are the one union box struct. Legacy reads the
local as it stands, as it does a union box narrowed to a smaller union.

## The change

- `boxNarrowArmOf`'s `box` rung takes `heldAsBox` on both sides (a union's own box or a boxed
  nullable), not only `RBox` to `RBox`. The read stays `RStage` of the local.
- The verifier's staged view admits any box-shaped rep on both sides (`boxShaped`).

## Witness

`tests/ir-shadow-rows/narrowed-box-read-as-narrower-box.vl`: an `R | i32 | null` parameter narrowed
past `R` and handed to an `i32 | null` parameter, and an `i32 | string` local read into an
`i32 | string | null` binding.

## Measured vs merge-base a00578d1f (fixpoint seeds on both sides)

- Fixpoint after one refresh; `--names` self-compile and mode-3 self-compile byte-identical.
- `ir-identity.sh --claimless`: identical 14018, fail under both 3267, differ 0.
- `ir-identity.sh --cases`: identical 7606, differ 0; witnesses same 60, differ 0.
- tests/cases legacy A/B: identical 7326, differ 0.
- tests/cases armed shadow: covered and matched 68,073 → 68,109 (+36);
  `uncovered narrowed read` 142 → 105.
- Corpus no-blocker functions unchanged at 44,857 (narrowed read 10 → 10).
- Self-compile L2 fuel +0.01%.
