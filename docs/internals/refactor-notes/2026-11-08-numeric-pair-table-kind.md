# Numeric widening reads the table: a `numeric` kind (2026-11-08)

Step 5, the last per-position family. Follows `2026-11-08-read-side-table-kinds.md` (#6819).

## The record

`numPairStamp` (`check_fit_rules.vl`) runs in `ctxTyStampOne`, beside `atomSrcStamp`. Where the
destination of a delivery is a wide number (`i64`, `f64`, `f32`), it records
`src * 8 + dst` of the two types' numeric kinds (1 `i32`, 2 `u8`, 3 `i64`, 4 `f64`, 5 `f32`,
6 a union of numbers). The program's record is `nodeNumPair` (reset with `nodeAtomSrcTyIx`). An
instance's re-check writes `elabCapNumPair`, cleared by `elabCapBegin` and banked by `elabRun` as
`elabNodeNumPairs`. The final check's write stands, and a write is a pure function of the node's
checked type and its destination, so neither the compile order nor the write order changes it.
`numPairAt` reads it through the carry chain, as `atomSrcTyAt` does.

## The kind

The three `emitExprAs*` helpers keep their build arms (instance literals, assigned literals,
radix literals, an `f32` float literal) and their union arms (`emitNumUnionConvert`). The plain
arms, where the site has derived a (src, dst) pair, go through `emitNumPlain`. Where the record
names the same pair, the node is seated (`numSeat`) and the table widens it at the record
(`emitCoerced`'s `numeric` arm, `emitNumPairOp`). Otherwise the site widens it at its own pair,
a named floor (`numFloorWhy`): `held`, `no record`, `dst differs`, `src differs`. The shadow's
controls (`boxDstDropSet`) reach that decision, so `tests/vl_box_dst_shadow_test.ts` can red it.

## Shadow (`run.sh`, sweep population)

| | count |
|---|---|
| table | 168,972 widenings, at 37 positions |
| built at the destination (literal arms) | 1,763 |
| floor: no record | 165,814, at 23 positions |
| floor: src differs | 20,428, at 10 positions |
| floor: dst differs | 1 (`emitBlockValueAsGo`) |

All 34 (position, class) floor rows are in `floors.tsv`. Of the `no record` floors, 141,979 are
`emitBinOperandAs` (an operator's operand, which no delivery stamps). Most of the rest are casts
(`emitNumWrapCast`, `emitNumExactCastFrom`, `emitNumPlainCast`) and `emitCoerceAtomPayload`. Of the
`src differs` floors, 19,994 are `arrLitDataElemEmit`: an element literal the checker types `i32`
that the site builds at the list's width. The record is right about the type and the site about
the rep, so these stay with the site.

## Sweep

23,670 programs, base (master `dfc71a0a`'s fixpoint) against candidate: identical records, so
0 `runs → not-runs` and 0 movers. A table widening emits the same instruction the site did, by
construction, so this is the expected reading. Fixpoint seed 6,529,266 bytes (+4,006, +0.06%).

## Not done

- **Operand records.** `binRetTy` stamps its operands' literal sets (#6819) but not their numeric
  pair, so `emitBinOperandAs` is the largest floor. The same stamp, with the operator's operand
  type as the destination, would cover it.
- **Casts and payloads** (`as`, `emitCoerceAtomPayload`, `emitFnTagDispatch`) are fitted at no
  delivery. Each needs its own recorder at its check site.
- The read-side floors listed in #6819's note are unchanged.
