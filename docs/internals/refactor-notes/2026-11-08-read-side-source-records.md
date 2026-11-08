# The read side's records: an atom's source set and a narrowed read's arm (2026-11-08)

Step 5, the read side of the coercion table. Follows `2026-11-08-unionbox-delivery-records-floors.md`
(#6800), whose last section names what the unbox side needs.

## Two recorders

- **Atom source** (`nodeAtomSrcTyIx`, per instance `elabCapAtomSrc`; read by `atomSrcTyAt`). At each
  delivery stamp (`ctxTyStampOne`), the literal set the delivered value holds, where it holds one
  (`tyIsAtomSet`, `| null` included). It is written in the stamp that writes `boxDstTyAt`'s record,
  so the final check's write stands, and it reads through `tyCarrySrcOf` the same way.
- **Narrowed arm** (`narrowedArmTyIx`, per instance `elabCapNarrowArm`; read by `narrowedArmTyAt`).
  Written by `narrowedFromTySet` / `elabCapNarrowNote` beside the storage type, so a later write to
  the node's type cannot replace it. Copies and carries follow `narrowedFromTyCopy` / `elabNarrowedCarry`.

Both are cleared with their siblings. `emitter-state-audit.vl --check` reports 0 never-cleared.

## The shadow

`atomSrcShadowNote` (in `emitAtomToStr`) and `armSrcShadowNote` (in `emitNarrowedArmUnboxTo`) count
rows in `box_dst_shadow.vl`. `probe.sh` tags both helpers by position, and `run.sh --read` prints
them by family, class and position. Over the sweep population:

| family | rows | agree | other |
|---|---|---|---|
| narrowed-arm unbox | 38 | 33 | 5 `site has no heap` (`emitDirectArgUnbox`, heap -1, emits nothing) |
| atom → string | 1,286 | 880 | 390 no record, 14 record narrower, 1 site has no member, 1 agree up to null |

The arm record agrees at every position with a heap: `emitArmDelivery` 13, `emitDirectArgUnbox` 8,
`emitAssignGlobal` 5, `emitReturnBoundaryWidens` 3, `emitCallRefArg` 2, `emitAssignIndex` 1,
`emitPushOne` 1. That covers 7 of the 12 positions. The other 5 have no row in the population.

Atom, by position, agree / no record: `emitStrValue` 223 / 274, `emitReturnCoercedValue` 150 / 10
(+8 narrower), `emitAssignIdent` 123 / 0, `emitRefIfArm` 103 / 52 (+6 narrower, +1 up to null),
`emitDirectArgValue` 87 / 1, `emitLetInitValue` 34 / 8, `emitAssignGlobal` 52 / 0. A `no record`
is a decode that is not a delivery: a concat operand or a template hole (`emitStrValue`), a
member receiver (`emitMemberNode` 10), or a union arm pair (`emitUnionIfArm` 14). Those need a
read recorder, not a delivery stamp. `record narrower` is the flow-narrowed set, a subset of the
storage set the site decodes against. It is sound, but switching to it changes bytes (a shorter
`select` tower), so a switch has to grade it by sweep.

## The one switch: D4028

`site has no member` was the open D4028 (`pair(null, k)` into `(string | null)[]`), refused at
emit with `literal-union string widening with no members`. `emitAtomToStr` now falls back to the
recorded set where `litAtomWidenTexts` finds none. It runs and prints `b!`. Pin:
`literal-unions/generic-pin-nullable-string-atom-arg.vl`.

## Not done here

The table kinds (`unbox` keyed by `narrowedArmTyAt`, `atomstr` keyed by `atomSrcTyAt`) and the
position-by-position switch. The arm shadow agrees everywhere it has rows, so the arm is ready. The
atom side needs a read recorder for its 390 non-delivery decodes first.
`emitAtomToStrChain`'s 9 external callers are not shadowed: they pass texts without the node.
