# Step 7: a for-in's `#l` temp reads its iterable's rep, and the `fiLk` ladder is deleted, 2026-11-11

This is conversion 4 of `2026-11-10-step7-vkind-census.md` §4, for `declareForInLocals`' `fiLk`.
Base is master `f50936aa` (#7141). Its fixpoint seed is 6,613,699 bytes.

The other rungs in that row are already settled:

- `njKindOfExpr`'s three rungs were deleted in `2026-11-10-step7-njkind-rungs-deleted.md`.
- `ifExprRefKindAt`'s `ObjLit` arm and `letCellKindGo`'s `holderRecordSigs` arm stand by design
  (DECISIONS.md, "Step 7: what VKind producers stand by design").

## What changed

`fiLk` was a 60-line local ladder. It mapped the loop variable's element kind to the kind of the
`#l` temp, the value the loop walks. Two syntax rungs (`forInStringSrc`, `forInU8Src`) then
overrode it for a string and a `u8[]`.

It is now `forInWalkKind` (`emit_classify.vl`), which reads the iterable's own type, the one
`forInElemKind` reads:

- a list or a string answers its own `repSigKindOfTy`;
- a map or set walk answers its keys list, by `tyMapKeyKind`: `list`, `i64list` or `strlist`, the
  same mapping `mvKeysWrapMint` mints;
- any other rep is an invariant `emitFailAt`, not a silent `"list"`.

The string and `u8` sources need no rung: their reps are `str` and `u8list`. The two predicates
keep their other reader, `emitForInStmt`.

## The differential

Three probe compilers were built by the base seed into scratch. Each computes the iterable's rep
kind beside the old `fiLk`.

- **The control fires.** An unconditional `emitFail` at that point, swept over shard 1/10 (2,389
  programs), fires in 207 cells.
- **Lists and strings:** where the rep is a list or `str`, a probe fires on any disagreement with
  `fiLk`. Its sweep of all 23,882 programs fires in **0** cells.
- **Everything else:** a probe fires wherever the rep is neither. It fires in 101 cells, and every
  one is a `map` (a map or set walk). There, `fiLk` was `strlist` 60 times, `list` 36 times and
  `i64list` 5 times, which is the keys-list mapping. No other rep and no uncovered type appears.

A hand program walks `m.values()` over a record-valued map, an `i64` map's keys and its pairs, a
`Set<string>`, a `u8[]` and a string. It prints the same on base and candidate.

## Proof

- **Seed:** 6,613,699 → 6,613,544 bytes (−155). Two refreshes are byte-identical.
- **Sweep:** `sweep.vl -- record` over all 23,885 programs, base against candidate: **23,885 the
  same**, with 0 bytes-only movers, 0 output movers, 0 `runs → not-runs` and 0 new compiler traps.
