# IR: a box retagged into a wider union at delivery (2026-11-21, lane IR-N4)

`exprPrePathWhy` refused every node whose coercion table names a conversion (`pre-path
coercion`). The largest sub-shape on the corpus is `mapRetag`: a union box built at one union
and delivered at a wider one, each arm re-tagged by the checker's retag rows.

## Sub-shapes (scratch build naming the kind)

Corpus functions whose only blocker is the class: mapRetag 112, listCopy 63, recCopy 6.
tests/cases: start recCopy 147, function listCopy 69, start listCopy 23, function mapRetag 23,
fnClo 9, recCopy 7, start mapRetag 6, mapUnbox 3. Every mapRetag operand is a box.

## The change

- **`RMapRetag`** (box family) carries the built box and the node. Its lowering is legacy's
  own tail, `emitMapRetagTail`, now exported: a pure walk over the node's retag rows and
  `unionAsBoxSlot`, with no emit state read, so the IR writes the bytes legacy writes.
- **The builder** builds the node under the `coerceHeld` seat (`coerceHeldSwap`), as
  `emitCoerced` does, so the operand is the value as built, then wraps it. An unboxed operand
  stays a named miss (`pre-path coercion mapRetag unboxed`); none is seen.
- **`exprPrePathWhy`** reads the held node as `none`, as `emitExpr` skips its table entry.
- **The verifier** reads the operand and requires the destination to keep its box rep.

## Left

listCopy's tails read emit state (`listRecCopies`, `exprEmittedRefListSlot`), so they need a
plan carried from the build, not a call. recCopy re-enters `emitExpr` per field and needs its
own lowering. fnClo and mapUnbox are small.

## Witnesses

`tests/ir-shadow-rows/map-retag-coercion.vl` (from
`tests/cases/literal-unions/dead-coalesce-widens-member-at-delivery.vl`): 3 covered and a start
`pre-path coercion` miss on the merge-base seed; 4 covered, 4 matched, start matched after.
