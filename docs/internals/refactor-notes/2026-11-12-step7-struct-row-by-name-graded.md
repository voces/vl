# Step 7: the struct-row-by-name registries graded, two dead name rungs deleted, 2026-11-12

`sNameIx` (behind `structIndexByName`) and `sitnMemo` (behind `structIndexOfTypeName`) are the
L6 census's two struct-row registries keyed by spelling. This note grades every call site of the
two functions by what its name is and whether a type the site holds would answer the same.

The population is the sweep's 23,975 programs, on the tree of #7414.

## Probes

Each call site was wrapped by a probe that tagged reach, hit and miss. On a hit, it also compared
the name's row with `structRowOfRecordTy` of that row's own type (`sTyIx`): would a caller holding
the type get the same row? The probe was validated on programs known to reach a site:
`closure-field-hole-param-per-call-instance` answers N7, N15 and N23 agree, and
`infer-empty-push-struct-unannotated` answers N14 and N26 agree. A second round asked three sites
against the type each holds locally.

15,487 programs reach a site; the census counted 15,496.

| site | function | agree | differ | miss | grade |
| --- | --- | --- | --- | --- | --- |
| N23 | `spellingHasStructRow` | 1,734 | 8 | 8,234 | floor: a spelling predicate (`isSName`, 7 callers, 5 in `emit_mono`) |
| N20 | `elemNameIsNominalAt` | 1,731 | 0 | 5,955 | floor: an element-name predicate (`elemNameIsNominal`, 4 callers) |
| N14 | `rlElemStructRow` | 2,216 | 1 | 3,150 | floor: the last rung after three type rungs, and it decides in 6 programs (D15552's held-list rep) |
| N18 | `structIndexOfTypeNameGo` | 0 | 0 | 3,553 | **deleted**: every caller asks `structIndexByName` first |
| N16 | `structIndexOfTypeNameTy` | 4 | 0 | 3,521 | floor: hits only on a call with no type (4 programs) |
| T17 | its `structIndexOfTypeName` fallback | 1 | 0 | 3,514 | spelling scan (`shapeRowScanK`), w317's consumer |
| N11 | `annSameTypeRowOf` | 0 | 0 | 2,673 | **deleted**: the layout find (#7414) answers a re-walked annotation first |
| N1 | `rlElemLitStructRow` | 140 | 0 | 701 | convertible: 139 agree, 1 differs, 503 read "variant" by name. The next cut |
| N26, N15, N7 | `anonRowTyOfName`, `anonPinRow`, `retStructRowIndex` | 920 | 17 | 35 | by design: an `#anonN` handle is the literal row's identity |
| N12, N13 | `gaeEnsure` | 323 | 0 | 319 | floor: a generic application's spelling is its instance key |
| N21, T24 | `structRowOfSpelling`, its fallback | 108 | 0 | 29 | floor: a spelling API (5 callers) |
| N6, N2–N5 | `emit_mono` | 27 | 0 | 348 | w317's pins |
| N0, N19 | `rowCanonIdOfName`, `refArrShapeKindGo` | 20 | 0 | 18 | floor: spelling-taking |
| N8 | `rowDumpBuild` | 0 | 0 | 0 | by design: a debug dump keyed by name |
| N9, N10 | `iisPushFieldElem` | 0 | 0 | 0 | unreached; w311/w314's |
| T22, N25, N27 | | 0 | 0 | 0 | unreached |

All the "differ" cells come from one family: D15646, D2762 and
`hole-closure-reads-param-field-per-pin`, at the `#anon` sites, plus
`record-is-narrowing-copy-runs` at N14 and N26. A literal's row need not be its type's shape row,
as `retStructRowIndex`'s comment states.

N16 is not guarded by type. A guarded call holding a type could fall through to
`structIndexOfTypeName` without a name rung once N18 is gone, and a declared name would then miss.

## What changed

- `structIndexOfTypeNameGo` no longer asks `structIndexByName`; its three callers already did.
- `annSameTypeRowOf` finds the same-type row by `repRowOfTyStruct` alone and loses its unused
  spelling parameter.

## Proof

- Controls: D10771's witness, D10770's, and `generics/anon-record-arg-to-record-pattern.vl`, the
  three the rung's comment names, build byte-identical modules on the old and new seeds.
- Sweep, against #7414's fixpoint seed: **23,975 same**, 0 bytes-only, 0 output movers.
- After merging master: a fixpoint at 6,664,610 bytes, `regress.vl` and lint-self clean, and the
  three witnesses print as before.
- `rep-fuzz-check.sh` exact; `cases_wasm` (7,467), seed size, late demands, plumb-shape cost, and
  the comment, ladder, sentinel, arena-scan, dead-export and render-parse budgets pass.
