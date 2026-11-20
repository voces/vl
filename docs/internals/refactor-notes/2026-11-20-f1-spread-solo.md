# IR spread, one group (2026-11-20)

Array-spread PR 2 of 3. PR 1 keyed every spread literal's slots by a recorded ordinal; this
lowers a literal of one item group, a spread source, through the IR.

## Shared plan

- `spreadPlanOf(arrIx, fnIx, lb)` (`emit_plan_list.vl`) decides, without writing a byte, what
  `emitArrSpread`'s plain arm decided inline: the destination kind and row, the wrapper and
  backing, and per item group its source (-1 for a run of plain elements), build code, row and
  pre-copy kind. The helpers it decides from moved with it: `spreadSrcRow`, `spreadOwnRow`,
  `spreadGroupSubRow`, `spreadFreshDestRow`, `rlRowElemSubOf`, `spreadBoxDestRow`,
  `spreadGroupSrcKind`, `spreadPendingScalar`, `pendingKindOfList`.
- Legacy's plain arm consumes the plan and the shared tail `spreadGroupStash` (view refresh,
  conversion, slot store), then `spreadJoinGroups`; both tails stay in `wasmEmit.vl`. The
  boxing arms stay outside the plan.

## IR

- `RSpread { spSrc, spKind, spSlot, spAt }`: the source operand and the list build its delivery
  threaded. The builder (`spreadLit`) claims a recorded literal of one spread item whose plan
  needs no conversion and no sub row, building the source raw as `emitSpreadGroup` emits it (a
  list literal at its own typed build, else the group's; anything else as itself) and requiring
  its rep to be the literal's. The verifier checks that equality and an `RList` result.
- The plan mints nothing. Its wrapper and backing (`spreadWrapIdx`, `spreadBackIdx`, which mint
  a pair on first ask) are asked by legacy's arm and by the lowering, each where legacy always
  has: after the plan, before the group. The builder asks the read-only `spreadPairKnown` and
  misses on `array spread pair unminted`. That miss reads 0 for a structural reason, and stays as
  the guard: a claimed literal's source has the literal's own list rep, so building the source's
  type has already minted the pair.
- The group count is read off the elements before any plan is asked, so a literal the IR leaves
  to legacy costs no plan call at all.
- `RMakeList` carries its list build (`mlKind`, `mlSlot`), and `arrayLit` takes the type behind
  that build: `arrLitBuiltTyOf` at top level, a nested source's own typed build's type, else the
  outer literal's type for a source built at the group's build, its kind and row.
- `svSyncRecv` reads only the source node, the function, and module tables set before any
  function is emitted (`rvSrcSlot`, `svPairs`, the sync helpers), so the IR's source build leaves
  it nothing different to read.

## Readings

Against a fixpoint at the merge-base c4a2c8fdb (candidate a fixpoint, 6,901,388 bytes, and
byte-identical to a build of `git archive HEAD`):

- Corpus functions with no blocker 40,959 → 41,109 (+150): every one-group spread; `array spread`
  233 → `array spread groups` 83, the many-group literals PR 3 lowers. Shadow 41,109 covered,
  verified and matched. Self-compile functions covered 18,517 → 18,517 (the compiler holds no
  spread literal).
- Corpus `ir-identity --names` 9,037 identical, 0 differ; `tests/cases` `--names` A/B 7,244
  same, 0 differ; `--cases` 7,524 identical, 0 differ; witnesses 59 same; mode-3 self-compile
  identical.
- A scratch probe seed summing every type table (`mAllocKind`, `sTyIx`, `sHeapIdx`, `rlElemTyIx`,
  `rlWrapIdx`, `unTyIx`, `mvValTyIx`, `uVarTyIx`, `uVarRow`, `uVariants`) around `spreadLit`,
  source build included: 0 probe rows over the corpus; its control, forcing a v128 pair mint,
  fires. The probe seeds were discarded.
- L2 self-compile fuel 103,357,419,293 → 103,436,743,388 (+0.08%); late demands 9 of 9, late tag
  rows 307 of 307; seed 6,901,388 bytes, +0.1% on the baseline.
