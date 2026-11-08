# An instance's `??` joins as its direct spelling; seven more positions read the table (2026-11-08)

Step 5, union boxing round 5. Follows `2026-11-08-unionbox-last-write-positions.md` (#6779).

## The instance `??` join: D15553, closed here

`D<A, B>(d: i32, v: A | B | null) { print(v ?? d) }` at `A = f64` recorded every box under the
`??` (`d`, `v`, the print argument) at `f64|string`. The ruling: an instance equals its direct
spelling, which joins at `f64|string|i32`. A write log on `boxTyStampOne` showed the record was
right for the type the instance gave the `??`. The defect was that type. `coalJoinApart` keeps the
widening for a union left operand in a function with type parameters. The template's left `A | B`
joins apart anyway (`coalParamDefault`). The instance's closed `f64|string` fell through to
`assignableExpr(d, i32, f64|string)`, and `i32` widened into the f64 member. Fix: every recheck
joins apart (`check_fit_rules.vl`). Ablation is in the row: without the type parameters, the
`f64` member or the declared `d`, record and site agree.

## Positions switched to `emitUnionBoxOwed`

`emitUnionIfArm` (both arms), the `else if` adapt-scalar link in `emitUnionIfValueLink`,
`emitAssignIdent` (union-declared branch), `emitStructFieldStoreValue`, `emitMapValDefault`,
`emitFnTagDispatch`, and in `emit_sections.vl` `emitStartGlobalInitValue` and `emitConstCellInit`.
`emitUnionBoxOwed` is exported for those last two. `emitUnionBoxArg` and `emitUnionCoerce` lose
their exports, because nothing outside `wasmEmit.vl` calls them now. `probe.sh` shims
`emitUnionBoxOwedP` in emit_sections.

Shadow (113,195 deliveries), top-level, table / floor:

| position | table | floor | floor classes |
|---|---|---|---|
| const-cell init | 1,812 | 0 | |
| global init | 2,246 | 188 | 182 record renders empty (`i32\|null`), 6 already a box |
| if arm | 207 | 38 | 13 niche/agree, 7 disagree (record `boolean\|null`), 7 never returns, 2 no record |
| assign ident | 414 | 11 | `i32\|null` niche |
| struct-field store | 202 | 0 | |
| map default | 49 | 0 | |
| fn-tag dispatch | 0 | 29 | agree, but `boxOwedAt` false (the record read through `instTyOrSelf`) |

## Ladders left

31 calls still box at a union the position computes: 13 `emitUnionBoxArg`, 10 `emitUnionCoerce`,
8 `emitVariantCoerce`. 4 of them are a helper's own floor (`emitUnionBoxOwed`, `emitUnionBoxAtRecord` ×2,
`emitUnionBoxArgGo`). The 8 `emitVariantCoerce` sites build a bare variant, not a box, so the
table does not serve them. The rest are coalesce stashes (10), map get/set (5), let init,
print, direct and captured call args, nul-arm locals and `njStash`, none switched yet. No floor
was deleted. Every switched position still floors on a niche or literal-set record.

## The shadow's last-write misses

Base shadow on master `e97619e8`: 20 rows `last=n` (6 top-level), and none is a spelling case. The
8 spelling misses #6779 counted no longer occur. All 20 are a value already a box, the left
operand of a `??` whose last write is `recordBoxTy(binLeft, join)`. In `union-of-maps-read*` the
record is `string|i32` where the arm's union is `string|i32|null`, and in `coalesce-result-rep`
it is `i32|string` where the stash is `i32|null`. Each value is a box that passes through, so the
bytes are unchanged (the sweep is byte-identical). The record still describes the join, not the
delivery. On the candidate all 1,072 history rows read `last=y`, but the if-arm rows only agree
because a table-delivered row's site now IS the record. The shadow cannot grade a switched
position against its old site union.

## Proof

Fixpoint seed 6,512,659 bytes (base fixpoint 6,512,640, +19; refresh twice, byte-identical).
Sweep base against candidate: 23,634 same, 0 bytes-only, 0 output movers, 0 `runs → not-runs`,
0 new traps (the new row's witness is the only one-sided cell).
