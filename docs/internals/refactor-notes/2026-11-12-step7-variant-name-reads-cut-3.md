# Step 7, L6: `mvValArmOfShapeTy` is deleted, 2026-11-12

`mvValArmOfShapeTy(name, ty)` was the map value table's third source for a record value's variant
row (D671). Both callers asked it in `emit_union_atoms`' value-slot mint: the `mvValVariantIdx`
column, and an arm value's ref-list row name. It read a spelling twice: a `nameIsWholeSpanShape`
gate and a `variantIndexOf` rung. Then it scanned the arms' field codes at three leniencies.
Measured on master `87dc752a` with the sweep's 24,189 programs.

## The probe

An accumulating probe ran the old function beside a type-only twin. The twin gated on
`structNameOfTy(ot) == ""` instead of the spelling and had no name rung. Every site marks itself
and `emitProgram` reports all the marks, so no site hides behind another.

| mark | programs |
| --- | --- |
| the old function answers a row | **0** |
| old and type-only answers differ | 0 |
| the spelling gate and the type gate disagree | 240, all with both answers -1 |

The function never answered a row. Both callers' rungs were dead in the population, so the
function is deleted rather than switched. A record map value that reaches neither name rung now
meets the existing loud refusal ("a record map value has no struct row"). Its variant column
keeps -1, the value it always had.

## What went with it

Only `mvValArmOfShapeTy` used the arm scan `variantRowScanOfTyK`. Only that scan used the
field-fit chain `jrFieldFitsAt`, `jrWantOf`, `jrUnionWantOf`, `jrLitAtomOf` and `jrMapValFits`.
All are deleted, 230 lines in `emit_shape_rows`. The arena-scan ratchet falls from 24 to 21:
`variantRowScanOfTyK`'s `uVariants` loop goes with this cut, and `repStructRowByName`'s `sNames`
loop went with #7615. The third fall, in `emit_obj_lit_fits`, came from master. The baseline is
written.

## Proof

- Refresh ×2 is a fixpoint at 6,716,925 bytes, −2,998 against master's 6,719,923.
- Sweep against master's fixpoint seed: **24,189 same**, 0 bytes-only movers, 0 output movers.
- lint-self is clean, and `regress.vl` lost no runs.
- Witnesses `--strict`: 4,856 as filed, 0 moved.
- Late demands 8, seed +1.9%, render-parse 13 and 28, and plumb-shape cost passes.
- `variantIndexOf` goes from 27 to 27 code sites: the deleted rung was inside the deleted
  function, and the two `variantIndexOf(valName)` rungs beside it stay. Those belong to the
  map-value slots (H).
