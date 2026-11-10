# Step 7 L2 §7: spelling floors measured, three type-held parses cut (82 → 79), 2026-11-10

The Closes list in `2026-11-10-step7-closing-census.md` reads 41 `tyToEmitName` renders and 82
type-string parses in the emitter. This PR measures which of the parses sit behind a type the
caller already holds (a "floor"), and cuts the ones whose type answer agrees on the corpus.

The base is master `e131211a`, with a fixpoint seed. The population is the 7,699 `tests/cases`
programs. The probes were `emitFail` markers in a scratch-built compiler, which was never
refreshed into the seed. `emitFail` reports only the first marker, so the probes ran in rounds,
dropping a hit marker each round to unmask the rest. Each probe set had a positive control:
some marker in the set fired.

## Where the parses are

| parser | sites |
| --- | --- |
| `nullablePartOf` | 20 |
| `nameIsArray` | 15 |
| `annArrowAt` | 11 |
| `nameIsLitUnionType` | 9 |
| `nameIsRefArray` | 6 |
| the other five | 21 |

Of the 82, 22 are in `emit_base.vl`, which this lane leaves to w282. Most of the rest are the
body of a name-keyed layer: the shape walk (`internShapeDeepTyGo`), the shape-spelling row scan
(`shapeRowScanK` → `shapeFieldTypeCompatK`), the mv value ladder (`mvValKindOfNameTy`) and the
union registry. Each of those still mints or finds rows under the spelling, so it is cut by
re-keying the rows, not one parse at a time.

## Floors probed

| probe | site | floor reached in | type answer |
| --- | --- | --- | --- |
| P1 | `ensureRefElemTys`: inner element name, `refArrElemName` | 56 programs | none: the caller holds no type (nominal `S`, `Circle`, `A`), and `structRowOfRecordTy` is -1 at every reach |
| P2 | `collectARefArrayAnn`: element row name, `refArrElemName` | 3 | `structRowOfRecordTy` agrees at all 3 (`#anon0..2`) — **cut** |
| P3 | `mvValIsRefList`: `nameIsRefArray` when `ty` is -1 | 0 | — **cut** |
| P4 | `fieldCodeOfSpelling` with `fty` -1 | 261 | none: callers hold no type |
| P5 | `nameFieldCode` with `fty` -1 | 646 | none: callers hold no type |
| P6 | `mvValNamesCompat` with an untyped side | 1 (`maps/map-get-through-unannotated-parameter.vl`) | none: `shapeFieldTypeCompatK` passes -1 by construction |
| NU/NM | `rlElemNicheNullable` against the row's `rlTy` | untyped 0; disagree 2 | the type is right — **cut** |

The two NM disagreements are ungrouped closure renders, `()=>K0|null` and `(i32)=>i32|null`.
Their arena types are a `TyFunc` whose result is nullable, and the spelling cut misread that as a
nullable closure. In both programs (`maps/nullable-map-closure-nullable-litunion-result.vl` and
`closures/closure-map-nulscalar-result-valuecall.vl`) the wasm is byte-identical either way, so
the flag on those rows is not read there.

P4 and P5 are the big remaining family: 646 programs reach a field code with no field type. One
caller passes -1 by construction: the shape-spelling scan (`shapeFieldTypeCompatK` asks
`nameFieldCode(t, -1)`). The others, `nameFieldCodeTy` and the shape interners, pass a field type
that is -1 at those reaches; this note did not split the 646 by caller. Cutting the scan's share means the scan matches on the record type's fields, as
`variantScanK` already does through `jrFieldFitsAt`, and not on the spelling.

## Changed

- `collectARefArrayAnn`: an element type that renders no name (an anonymous record) is named by
  its canonical record row (`structRowOfRecordTy`), not by cutting the annotation's spelling.
- `mvValIsRefList(ty)`: asked of the type only. -1 is not a ref list.
- `rlElemNicheNullable(kind, ty)`: niche-nullable iff the row's arena type is a `TyNullable`.

## Proof

- The byte sweep built all 7,699 case programs with the master fixpoint and with the candidate
  fixpoint: 0 differ in wasm bytes or in emit message. The instrument was checked against a known
  mover, the D12465 mixed pair, which refuses on master and builds on the D12465 seed.
- The render-parse ratchet goes from 82 to 79 parses (41 renders unchanged), with
  `--write-baseline` in this PR.
- Locally: refresh ×2 byte-identical, rep-fuzz, lint-self, seed-size, late-demands,
  dead-export, render-parse, emitter-state audit, cases_wasm 0–3, inventory refs/rows,
  pin-helper budget, `vl_scaling_shape`, `vl_probe_rollback`, `check-filed-witnesses --strict`.
