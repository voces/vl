# Step 7 slot layer: the map-value bank's spelling classifier is a named floor, unreached, 2026-11-11

The map-value bank's name producers and codecs are converted (#7144, #7157, #7163, #7201, #7231,
#7255). One spelling classifier stays: `mvValKindOfSpelling`, reached through
`mapValKindLowerable` and `mvValKindOfNameTy`'s untyped arm. This note records it as a floor:
what reaches it, and what it waits on.

## Its callers

Each caller reaches it only when it holds no arena type:

| floor | site | waits on |
| --- | --- | --- |
| F1 | `emit_shape_intern` `fieldMapLowerable(ftxt, fTy)`, at `fTy < 0`. `funcTypeShapeLowerable`'s field type comes from `tyFieldTyOf`. | w314's field type column |
| F2 | `emit_shape_rows` `nameFieldCode`'s nullable-map arm, at `recTy < 0` (the field-code ladder) | w314 |
| F3 | `emit_shape_rows` `shapeFieldTypeCompatK` → `mvValNamesCompat(shapeFieldElemName(t, want, -1), -1, …)`, reached only from `shapeRowScanK`, the spelled-shape row scan behind `structIndexOfTypeName` | w324 (Family B) |

## Measurement

I built a probe compiler into scratch on master `1d517770`. It marked each floor with a distinct
`emitFail`, and all three markers are in the probe seed. Swept over the whole population
(`scripts/sweep.vl`, 23,909 programs), it fired **0** times at each of the three. Three hand
controls did not reach them either:

- a union whose arm has a nullable-map field, built from a function;
- union arms with map fields of different value types;
- a list of records holding `Map()`.

## Why it is not retired here

Retiring a floor means choosing its answer for the no-type case:

- F1 not lowerable;
- F2 not a nullable-map field;
- F3 lenient.

Each choice turns a no-type program that lowers today, if one exists, into a loud refusal. That
would be a clause-2 regression the population cannot show. The floor goes when its callers hold
the field's type, so no answer has to be chosen.
