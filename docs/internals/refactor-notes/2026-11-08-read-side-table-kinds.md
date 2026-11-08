# The read side reads the table: `unbox` and `atomstr` kinds (2026-11-08)

Step 5, the read side. Follows `2026-11-08-read-side-source-records.md` (#6811), which added the
two records and their shadow.

## Two kinds

- **`unbox`**, keyed by `narrowedArmTyAt`. A position that owes an arm seats the node (`armOpen`)
  before it emits the value and closes the seat after (`armClose`). The table casts to the
  recorded arm's heap (`armRecordHeapAt`). Where there is no record, the position casts at its own
  heap: a named floor. The position still decides whether its slot wants an arm. The table decides
  which heap.
- **`atomstr`**, keyed by `atomSrcTyAt`. `emitAtomToStr` seats the atom. The table decodes at the
  recorded set (`emitAtomStrAtRecord`) when that set holds members, agrees on `null`, and names
  nothing outside the site's set. Otherwise the site's own set is used (`atomFloorWhy`): no record,
  null differs, record wider, or the node held by another conversion.

## A read recorder

`binRetTy` stamps both operands of every binary expression with `atomSrcStamp`. It is the same
recorder a delivery uses, so a concat operand or a string compare reads at the set the checker
gave it. That took 274 `emitStrValue` no-record rows to 46.

## Shadow (`run.sh`, sweep population)

| family | table | floors |
|---|---|---|
| narrowed-arm unbox | 33, at 7 positions | 5 `site has no heap` (`emitDirectCallArgsUnder`: the parameter is the box) |
| atom → string | 1,125 (18 narrower, 3 site has no member) | 163: 127 no record, 36 null differs, at 17 (position, class) rows |

Every floor is listed in `scripts/box-dst-shadow/floors.tsv`. The `null differs` floors are new.
The operand stamp records `K | null` at an atom the site decodes as `K`, e.g. a `??` left operand
read inside its non-null branch. The table refuses those, so they keep the site's bytes.

## Narrower decodes: taken

Sweep (23,664 programs) against master: 0 `runs → not-runs`, 0 outcome or stdout movers. 4 modules
change bytes (D1728, `captured-litunion-assign`, `if-join-atom-arm-meets-string-arm`,
`is-literal-set-overlap-narrows-to-meet`). Each is a flow-narrowed decode with fewer tag arms.
Every other agreeing row is byte-identical, including the tower's member order.

## Not done

- **`emitAtomToStrChain`'s 6 outside callers** decode through texts with no seat:
  `emitUnionCoerceValueAtom`, `emitSharedFieldArm` (2), `emitAsLitAtom`, `emitPrintAtomFromStash`
  and `emitCoalesceNulAtomStr`. Each has a node except the shared-field pair, which reads a field
  of each variant. These are the floors still to route.
- **Numeric widening** is still decided per position: 84 calls of `emitExprAsF64` (27),
  `emitExprAsI64` (28) and `emitExprAsF32` (29), in 32 functions. A numeric (src, dst) recorder
  is the last `lowerCoerce` family.
