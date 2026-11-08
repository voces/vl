# Step 7: the pre-monomorphize `collectA` run deleted

Measured 2026-11-08 on master `45817891` (after #6747 and #6748), 4-core box, over the sweep
population (23,615 programs, `scripts/sweep.vl -- list`).

## The gap the run was covering

`2026-11-08-step7-premono-dispatch.md` parked this run on one program,
`tests/cases/maps/map-value-union-struct-map-field.vl`, which refused with `emitProgram: map
value type has no interned slot` when the run was skipped. A named probe seed (a deliberate
trap after the refusal, built with `--names`) put the asker on master `2684af7c`, before #6747:

    mvSlotOfValNameFindK ← sFieldMapShape ← mapReadMvSlot ← exprVariantIndex ← letIsVariant
      ← structIndexOfIdentExpr ← drwWalkMemberCall ← dispatchRewrite

So the slot was not missing from `collectA#2`. `dispatchRewrite` asked for the receiver's struct
row before monomorphization. That ask reached a find-only map-slot reader, and only the pre-mono
`collectA` run had interned the slot by then. #6747 replaced that ask with the checker's
member-call rung. On master after #6747, skipping the run leaves this program and its siblings
unchanged. The value is `{f: (i32) => string}`, read through the map:

| probe (inside a function) | base | without the run |
| --- | --- | --- |
| the filed witness (`v: {f: {[string]: V}}`, read `v.f["k"]`) | runs | runs |
| the same, with a value stored and its closure called | runs | runs |
| map in a list field (`{f: {[string]: V}[]}`) | runs | runs |
| map in a nested record (`{o: {f: {[string]: V}}}`) | runs | runs |
| map as a return value (`mk()["k"]`) | runs | runs |
| record returned with a map field (`mk().f["k"]`) | runs | runs |
| un-annotated: `Map<string, V>()` bound, then held in `{ f: m }` | runs | runs |
| un-annotated: `{ f: Map() }`, value inferred from a later store | refuses | refuses |

The last row fails the same way at both seeds (`object literal field count does not match
struct`). It is a separate defect that this change does not touch.

## The change

The `collectA` pass row, its `EmitPass` member and its dispatch arm are deleted.
`collectA#2`, after `collectAnnShapes`, is now the only run. Inside `collectA`, the array
intrinsic's `!emitPhaseReached("monomorphized") ||` gate is always false now, so it goes.
`compiler/lint.vl`'s `klEmitPass` mirror drops the name.

## Pre-monomorphize classifier asks (`scripts/classifier-census.vl`, both seeds)

| | base | after |
| --- | --- | --- |
| pre asks | 154,489 | 18,995 (−135,494, −88%) |
| during mono | 8,573 | 8,604 |
| post asks | 46,092,863 | 46,092,845 |
| classes post-only / both / pre-only | 27 / 74 / 1 | 32 / 69 / 1 |

Now post-only (pre asks in base): `arrLitIsF32` 25,429, `arrNewNamedKind` 310,
`letInitNarrowedAtomKind` 7, `compositionMapReadSlot` 3, `popRefRecvSlot` 1. None of them became
dead. The one pre-only classifier, `arrLitRefListRow` (99 pre asks), was pre-only in base too.

## Proof

| check | result |
| --- | --- |
| fixpoint | two `refresh-compiler.sh` runs byte-identical |
| seed size | 6,497,485 → 6,497,391 (−94), both fixpoints |
| `scripts/sweep.vl` diff, 23,615 cells | 23,615 same, 0 bytes-only, 0 movers, 0 `runs → not-runs` |
| guest fuel, `vl check --codegen compiler/entry.vl` | 99,487,522,322 → 98,860,546,224 (−0.63%) |
| guest fuel, `vl check compiler/entry.vl` | 60,440,682,992 → 60,440,651,278 |
