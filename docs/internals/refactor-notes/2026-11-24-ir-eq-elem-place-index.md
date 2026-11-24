# IR: a record compare's element side at a place index (2026-11-24, lane IR-N1)

`record compare element place`, the half #9905 and #9950 left: `xs[i] == p` where the index `i`
is a global, or field reads over a variable (`ys[h.k]`, `ys[h.in.k]`). The builder took only a
variable or immediate index, so such an index, which builds a node, missed.

## The family, by ablation

On master 423d7265, one program per ingredient:

| variant | master |
|---|---|
| index a global (`gs[i]`, `ys[i]`, with a nullable side too) | miss |
| index a field read (`ys[h.k]`) | miss |
| receiver itself an element (`pairs[0][0]`) | miss |
| index a const, a param, a let, an expression | matched |
| a literal or a call on the other side | matched |

The receiver-is-an-element shape is not this change: it stays `record compare element place`,
with one tests/cases cell (`structs/diamond-record-eq-list-leaf.vl`'s start). Its nested element
read would need its inner read's rows banked.

## What landed

- **Builder** (`structEqSide`): an element side's index may be a place that `structEqPlaceRead`
  accepts (a global read, or field reads over a variable), built from where the index starts.
- **Lowering**: that index's temp is skipped (`structEqPlaceSkip`), and its `elem` root gets
  `epIdx` -2 (`structEqElemPlace`).
- **wasmEmit** `refListReadAt`: an `elem` with `epIdx` -2 writes the index as its expression
  (`emitIdxIndex`), as legacy's own root does. Only the IR builds an `elem` place.

## Why the re-read is safe

The index is read again at each field. A call on the right stages both sides
(`structEqStagesLeft`), so the element is read once, before the call. A call on the left runs
first, and the element is then read after it, as in source order. The matrix's `*_R_call` cells,
whose call writes the index source (a global, `h.k`, `h.in.k`), read after the call on base, head
and claimless alike.

## Legacy tails the IR calls

- `refListReadAt` (`wasmEmit`), through `emitChainRootElem`, now with an index written as its
  expression where `epIdx` is -2.

## Witnesses

- `tests/cases/structs/record-compare-element-place-index-matrix.vl`: seven index kinds (global,
  field, field of field, const, param, let, expr) × element left or right × a call or not. Base 23
  of 32 functions matched, with 9 misses. Head 32 of 32. All three compilers print the same, and
  claims-on is byte-identical to claimless.
- V3's order spellings, verbatim: `…-index-call-order-top.vl` (`true 1 true 1`),
  `…-index-call-order-param.vl` (the same over a list parameter) and
  `…-index-call-order-nested.vl` (`false 2 true`). Each is a miss on base and matched on head.
- `tests/ir-shadow-rows/nullable-record-compare-element-side.vl` (#9950's row): its order cells
  now exercise #9950's claim. 13 of 13 matched, with `no row containing record compare element
  place`. The row's comment and #9950's note are corrected to match.
