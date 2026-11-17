# Self-compile fuel, profiled: where an L2 build's time goes, and what grew since 93.95G (lane H), 2026-11-17

The L2 self-compile baseline was 93.95G at `6cd505a50` (#8837). #8914 rebaselined it at 94.79G
(+0.89%). This note profiles both ends to find stateless wins and to name what grew.

## Method

- Fixpoint seeds at master `a68eff941` and at `6cd505a50`; a `--names` seed from each.
- Each tree's `vl build compiler/entry.vl`, run from its own checkout root, guest-profiled three
  times (`VL_PROFILE_GUEST`): 59,805 samples on master, 58,617 at the baseline.
- Each sample is charged to its first frame that is neither a `__` runtime helper nor a trivial
  accessor (`nodeAt`, `tyAt`, `i32ListHas`, `nodeTyIxOf`, `nodeChildren`, `nodeKidsOf`,
  `identDeclOf`, `sidOfNode`, `unwrapParen`, `parenPeelIx`, `nomNameOfTy`, `flattenVariantsInto`,
  `objFieldIndexOf`, `tyElemOf`, `tyKeyOf`, `tyValOf`): the frame that pays.
- Function names are compared with their line number and module hash stripped.
- These are time shares, used as a proxy: fuel is not attributable per function.

## Where master's build goes

Raw self time, led by the accessors, spread across every caller:

| self % | function |
|---:|---|
| 6.63 | `nodeAt` |
| 4.37 | `__grow_0__` (list growth) |
| 3.88 | `tyAt` |
| 2.98 | `__str_eq__` |
| 1.79 | `__map_entry_i32__` |
| 1.46 | `__map_resize_i32__` |

The ten largest payers:

| share % | payer | main caller |
|---:|---|---|
| 1.57 | `objFieldType` | `assignableGo`'s record arm, 1.26 |
| 0.99 | `assignableGo` | |
| 0.87 | `a20RetWalkGo` | `a20RetWalk` 0.46, `frsMintRetLits` 0.41 |
| 0.68 | `weRefsIn` | `weFnRefs` |
| 0.66 | `collectCloSigs` | |
| 0.63 | `unionMembersInto` | `tySameMembers` 0.36, `unionEq` 0.26 |
| 0.60 | `nominalDeclAtOfObj` | |
| 0.58 | `readAtomKindOfTy` | `readContainerKindOfTy` |
| 0.56 | `weBoundWalk` | |
| 0.56 | `crwVisit` | |

Inclusive, the check is 43.9% and `emitProgram` 40.7%.

## What grew

Nothing moved by much. The largest increases in payer share since `6cd505a50`:

| pp | payer |
|---:|---|
| +0.16 | `fvaValueRowWalk` |
| +0.09 | `mfrLitsRun` (moved from `mfr_shadow.vl` to `elab_reads.vl`) |
| +0.08 | `tyTestMemberFit` |
| +0.07 | `mapTwinNotePattern`, `strAccWalk`, `assignable` |

Every other function moved by less than 0.07. The +0.89% is source growth spread thin, with
legacy and the IR both live, not one regression.

## The candidates, measured before building

| candidate | cost today | finding | gain |
|---|---:|---|---|
| a same-position fast path in `assignableGo`'s record arm | 1.26 | 0.82 is `objFieldIndexOf`'s own length-filtered scan and 0.30 its string compares. The fast path is exact only after proving no earlier duplicate of the name; a refused duplicate field still mints a row that repeats it, and that proof costs the scan | about 0.2–0.3, not taken |
| `emitPhaseReached` without the string `match` | 0.40 | the match itself is 0.16; the rest is call volume from `scopeTyAt` and `nodeTyAt` | about 0.1 |
| `frsMintRetLits` once per function | 0.77 inclusive | already once per function (`retLitsFirst`) | none |
| walkers off `nodeKidsOf`'s fresh child list | 0.52 of `__grow_0__` | spread over walkers; the largest, `a20RetWalkGo`, is about 0.3 | about 0.1–0.3 per walker |

The hot memos already exist (`a20RetWalk`, `pairMemo`), and the largest single payer is 1.6%. No
stateless change found here recovers the drift. The structural lever is deleting legacy paths as
the IR stages land.
