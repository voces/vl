# The shape-text field recorder's ref-list spelling legs are deleted, 2026-11-12

`shapeFieldElemName` (`emit_shape_rows.vl`) records a list field's element name. It reads the
name off the field's type (`shapeFieldElemNameOfTy`). For a ref-list field (code 5) or a
nullable one (code 28) that the type left unnamed, it fell back to the spelling through
`refArrElemKeyDeferred`, one of the name-based ref-list cluster's roots.

Validated `emitFail` probes:
- The function is reached with a ref-list code by 134 of the 7,816 `tests/cases` fixtures. This
  is the control that the instrument sits on a live path.
- A probe at each spelling leg fires on none of the 7,816 fixtures.
- It also fires on none while self-building `compiler/entry.vl`.
- Under the probe compiler, the distilled corpus reads cell-for-cell as under the plain one.

Both legs, `refArrElemKeyDeferred` and its two type-string parses are deleted.

## Measurement

| measure | before | after |
| --- | --- | --- |
| fixtures reaching the legs (probe), and the self-build | 0 of 7,816; none | — |
| distilled corpus cells, per-cell JSON against the base seed | — | 0 differ |
| emitter type-string parses (render-parse census) | 44 over 39 names | 42 over 37 |

The cluster's remaining roots are `refArrElemKind` (in `refArrShapeKindGo`), `iisPushFieldElem`
(`emit_shape_intern.vl`) and `ensureRefElemTys`'s `refArrElemName` fallback.
