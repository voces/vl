# The rep classifiers that read a spelling, 2026-11-11

`vl run scripts/rep-classifier-census.vl -- --reads SPELLING` on master `5613f704`+ lists 12
classifiers (29 call sites) that read a type's spelling directly (`startsWith`, `endsWith`,
`nullablePartOf`, `nameIsShapeSpanEnds`, ...). Each is placed below.

| classifier | file | verdict |
| --- | --- | --- |
| `paramStructIndex` | emit_sig_tokens.vl | converted here: the inline-shape rung asks `annIsSpelledInlineShape`, which reads the annotation's tree and falls back to the spelling only where no tree survives |
| `annIsSpelledInlineShape` | emit_sig_tokens.vl | floor: the question is how the annotation is *spelled* (an inline `{a: i32}` against a name of the same record), which the arena type does not carry; it reads the tree first |
| `refArrShapeKindGo`, `refArrElemNameGo`, `refElemArrName` | emit_shape_rows.vl | name-keyed by their signature: every caller hands a rendered name (`emit_shape_intern.vl`, the union atoms, the field codes). Converting them is converting those callers to the type, the render-parse readers' work (L6) |
| `shapeFieldElemName`, `shapeFieldTypeCompatK`, `nulScalarListKind` | emit_shape_rows.vl | skipped: field-code functions (lane w314); `nulScalarListKind`'s one caller is `nulScalarListFieldCode` |
| `nameFieldCodeTy`, `funcTypeShapeLowerable`, `internShapeDeepTyGo`, `structElemArrayLowerable` | emit_shape_intern.vl | skipped: lane w310 |

After this change the census lists 11 (29 call sites; `paramStructIndex`'s one call site of a
spelling helper moves into `annIsSpelledInlineShape`).

**Proof.** No `@run` output changes under `tests/cases`. The corpus oracle (`cases_wasm_0..3`)
passes 7,440, distilled `regress.vl` loses no run, lint-self is clean, render-parse budget holds.
