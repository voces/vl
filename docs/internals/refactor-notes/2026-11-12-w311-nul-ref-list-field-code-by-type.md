# The nullable ref-list field code is answered by the type, 2026-11-12

`fieldCodeOfSpelling` (`emit_shape_rows.vl`) gave a field code 28 (`FC_NUL_REF_LIST`) when its
spelling parsed as a nullable list of reference-stored elements (`nameIsNulRefList`). That was
one of the five roots left in the name-based ref-list cluster after #7546. The arm now asks the
field's arena type (`tyIsNulRefList`): a `TyNullable` of a `TyArray` whose element
`refListElemKindOfTy` stores by reference. `nameIsNulRefList` is deleted.

Validated `emitFail` probes over the 7,816 `tests/cases` fixtures:
- The arm fires on 5 fixtures, every one with a type. A second probe, firing only where the
  arm was reached without a type, fires on none.
- A differential probe, which fails wherever the spelling and the type answer differently,
  fires on 1. In `closures/nullable-struct-list-field-lambda-literal.vl` the spelling
  `{f:string}[]|null` said no, while its type `{f: string}[] | null` says yes.
- All 5 fixtures build byte-identical modules on both seeds.

## Measurement

| measure | before | after |
| --- | --- | --- |
| distilled corpus cells, per-cell JSON against the base seed | — | 0 differ |
| emitter type-string parses (render-parse census) | 51 over 46 names | 49 over 44 |

The cluster's remaining roots are `refArrElemKind`, `refArrElemKeyDeferred`, `iisPushFieldElem`
and `ensureRefElemTys`'s `refArrElemName` fallback.
