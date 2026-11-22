# IR: a narrowed atom read at its own cell (2026-11-22, lane IR-N3)

The coordinator ruled the atom→string residue of `narrowed read` to IR-N3. An instrumented miss on
master 47b9d7bb ranked it as rows whose local holds an atom (`own=atom` or `N:atom`) and whose node
the checker types at a single string literal (`rep=str`). Legacy reads such a local as it stands
wherever it writes the operand raw. The IR built it at the node's string rep instead, and
`narrowedLocalRead` has no rung for that outside a seated read.

## The change

- `staticSideOf` (the operand of `atomCompare`'s `fold` and `static` arms) builds the side with
  `exprAt(…, true)`. Legacy's `emitStaticLitAtom` writes a non-literal side with `emitExprRaw` and
  drops it, so for an atom local this is `local.get` at the atom rep.
- `refIfArm` builds an `atomStr` arm (`refIfArmOf`) the same way, and `atomToStr` decodes it, as
  legacy's `emitAtomToStr` does.

For an `Ident`, the `cell` flag changes only `narrowedLocalRead`'s last rung (`atomAtStr`), so no
other read moves.

## Left open

- `v ?? "none"` over an atom narrowed to one literal (the `d16530_*` named cells, 8): legacy's
  `closed` coalesce writes the left side at its `K | null` cell rep and print decodes a nullable
  atom, so the result rep is not the node's. That is not a narrowed-read rung.
- An assignment's value re-read (`(u = "b")`) misses earlier, on `atom cell local rep`.
- A boxed literal union narrowed to its atom members and passed to a non-null `"a" | "b"`
  parameter (`eq-literal-narrows-boxed`) reads `N:atom` at a non-null string. `atomAtStr` does not
  take it.

## Witness

`tests/ir-shadow-rows/narrowed-atom-read-at-its-cell.vl`: `rank` (a folded `==` side), and `bound`
and `given` (an atom arm of a `string` if-join).
