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
- The group count is read off the elements before any plan is asked: the plan's wrapper lookups
  mint types, and asking it for a literal the IR then leaves to legacy reorders the type section.
- `RMakeList` carries its list build (`mlKind`, `mlSlot`), so a nested literal built at a
  spread group's build lowers at that build, not at the one its own node would ask for.
- `svSyncRecv` reads only the source node, the function, and module tables set before any
  function is emitted (`rvSrcSlot`, `svPairs`, the sync helpers), so the IR's source build leaves
  it nothing different to read.

## Readings

Against a fixpoint at the merge-base c34a60bfd (candidate a fixpoint, 6,894,165 bytes):

- Corpus functions with no blocker 40,615 → 40,765 (+150): every one-group spread; `array spread`
  233 → `array spread groups` 83, the many-group literals PR 3 lowers. Shadow 40,765 covered,
  verified and matched.
- Corpus `ir-identity --names` 9,037 identical, 0 differ; `tests/cases` `--names` A/B 7,241
  same, 0 differ, 1,394 fail under both; self-compile identical.
- L2 self-compile fuel 103,413,854,970 → 103,480,022,716 (+0.06%).
