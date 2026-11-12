# Step 7 D6 step 1a: the interner codes a field from its type, and the closure-signature column takes no text, 2026-11-12

The D6 interner re-key (`2026-11-12-w311-d6-interner-rekey-design.md`) reordered after cut 3.
A walk by type cannot delete a render on its own: the walk's leaf hands the render to
`internInlineShapeTy`, which splits it into field names and per-field texts, and seven consumers
inside `internInlineShapeTyGo` read a field's TEXT. Each must read the field's type first. This
step takes two of them.

## Field coding

`internInlineShapeTyGo` coded each field with `nameFieldCodeTy(ftxt, fldTy)`. Validated `emitFail`
probes over the sweep population (24,196 programs):

| probe | programs |
| --- | --- |
| control: a field coded | ≥ 5,770 |
| the field has a type, and `nameFieldCodeTy("", fldTy)` differs from the text-and-type answer | 0 |
| the field has no type (`fldTy` -1: a caller with no record type) | 12 (texts such as ` i32`, e.g. D15430) |

A field with a type is now coded from the type alone. One with none is still coded from its text:
that is a floor, the callers that hold no type (`internShapeAs` and the text-only shapes), and
step 2 names them.

## The closure-signature column

`fieldCloSigOf(code, _ftxt, fty)` already ignored its text. The parameter is gone, and so is
`sFieldCloSigCompat`'s, which only passed the text on. Their four callers in the interner no longer
hand a field text over.

## Proof

Fixpoint seeds, master `74286336` against this step, the whole population (24,202 programs): all
the same. `scripts/gate.sh` passes.

The remaining text consumers in `internInlineShapeTyGo`, each the next step:

- the recursion `internShapeDeepTy(ftxt, fldTy)`;
- `nestedFieldShapeRow(ftxt, …)`;
- `armTwinRowName(nonNulBaseOf(ftxt))`;
- `shapeFieldsRideTyParam(rawTexts, …)`;
- `iisPushFieldElem`'s texts, through `shapeFieldElemName`, which is lane E's.
