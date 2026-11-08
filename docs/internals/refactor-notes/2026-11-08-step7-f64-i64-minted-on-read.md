# Step 7: the f64 and i64 list pairs are minted on first read

Measured 2026-11-08 on a 4-core box. The base is #6909's tree merged with master `210e6e9a`. Both
seeds are fixpoints (two `refresh-compiler.sh` runs byte-identical). The population is the
sweep's 23,741 programs.

| | base (fixpoint) | candidate (fixpoint) |
| --- | --- | --- |
| sweep | | 23,656 same; 85 bytes-only, 0 output movers, 0 runs lost, 0 new traps |
| seed bytes | 6,571,927 | 6,569,870 (−2,057), +2.7% of the +3% bar |
| plumb-shape main fuel / RSS | 8,975,636,030 / 318.0 MB (baseline) | 8,816,740,582 / 318.5 MB |
| plumb-shape tail fuel / RSS | 6,579,647,243 / 317.7 MB (baseline) | 6,393,476,672 / 318.3 MB |

## What moved

`fa64Used` and `ia64Used` are deleted, in the same way #6909 deleted `fa32Used`.
`fa64Ty`/`fl64Ty` and `ia64Ty`/`il64Ty` mint each pair on first ask. The indices read −1
until then, and `isFl64Ty`/`isIl64Ty` are the comparisons.

* All 48 setters are gone.
* The bodies' 15 `not collected` guards are gone, and so is `wideListWrap`, whose only job was
  that refusal.
* `svReserve` now keeps a view from the checker's `scalarViewPairs` bit, plus `lUsed` for the two
  views whose source is an `i32[]`. `mAssignScalarListPairs` mints each view's destination
  pair (`svDstOn`) and the f32 source pair before the views, because a view subtypes the
  destination's wrapper.

## The 85 bytes-only movers

Each program was built under both seeds and the disassembly compared. 84 lose two or four
types, and keep the same function bodies line for line:

* 83 lose one dead pair (f64 or i64).
* `nullable-scalar-elem-list` loses both.

collectA flagged a shape that no lowered body, field or signature reads. No module gains a
type, so the `svReserve` change added no view in this population.

The 85th, `long-literal-widths-exact`, compiles byte-identically under both seeds when it is
compiled alone. It moves only in the sweep's batch, after `long-literal-u8-data-segment`:

* Compiled after that program, the base's module also differs from its alone build
  (`18182d96…` vs `44c9aab8…`), and its local declarations shift.
* That is an existing cross-program state leak in `vl check --batch`, not this change. Both
  seeds leak, and they leak differently.

## What stands

* `lUsed` and `slUsed` next. `lTypeIdx` is minted before `mStructIdxPre` predicts the map
  struct's index from the counter, so a lazy `lTy()` must mint before that prediction when an
  `RLK_I32_LIST` row exists. The i32 wrapper also references `aUsed`'s array, which stays a
  flag until last.
* `mUsed`, `ba8Used` and `aUsed` still gate helper indices fixed before the bodies.
