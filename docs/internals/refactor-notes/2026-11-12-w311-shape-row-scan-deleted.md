# The field-set scan behind `structIndexOfTypeName` is deleted, 2026-11-12

`structIndexOfTypeName` (`emit_shape_rows.vl`) answered a whole `{…}` spelling that resolves no
type with a scan of the struct table (`shapeRowScanK`). The scan matched each row by field-name
set, guarded each field by its spelling (`shapeFieldTypeCompatK`, the `nameFieldCode(t, -1)`
leg of the field-code ladder). It is the spelling half of the name-based ref-list cluster that
cut 5 (#7518) left gated.

An `emitFail` probe at the top of the scan fired on 1 of the 7,816 `tests/cases` fixtures,
`generics/is-list-arm-map-callback.vl`. There, `paramStructIndex` (`emit_sig_tokens.vl`) asked
by the spelling `{y:i32}` of a callback parameter's annotation, because the instance recorded no
type for the parameter. That reader now falls back to the annotation's own type. With it, the
probe fires on 0 of 7,816 fixtures, and the distilled corpus reports no runs → not-runs. The scan,
its guard, `structIndexOfTypeName` and its memo, and every helper only they called are deleted.
`spellingHasStructRow` is now `structRowOfSpelling(name) >= 0`.

## Measurement

| measure | master | this |
| --- | --- | --- |
| fixtures reaching the scan (probe) | 1 of 7,816 | 0 of 7,816 |
| distilled corpus cells, per-cell JSON against a seed of the base | — | 0 differ |
| emitter type-string parses (render-parse census) | 55 over 50 names | 51 over 46 |
| lines in `compiler/` | — | −317 |

The parses that left are the guard's `annArrowAt(t)`, `fnRetTextOf(t, aa)` and two
`nameIsLitUnionType(t)` reads. The cluster's remaining roots are `fieldCodeOfSpelling`'s
`nameIsNulRefList`, `refArrElemKind`, `refArrElemKeyDeferred`, `iisPushFieldElem` and
`ensureRefElemTys`'s `refArrElemName` fallback.
