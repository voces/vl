# Step 7, L6: `armFieldStructRow` by type, and `structRowOfAnnTyGo` through `| null`, 2026-11-12

`armFieldStructRow(base)` gave a field typed as a union arm the arm's heap-twin struct row
(D761). It asked `variantIndexOf` of the field's spelling, peeled of `| null`. `armTwinRowName`
gave that row's name. Both callers sit in `internInlineShapeTyGo` (`emit_shape_intern`), and both
already hold the field's type `fldTy`. Measured on master `82ca1ef1`, 24,196 programs.

## The probe

An accumulating probe ran the name form and a typed form side by side. The typed form is
`exactArmRowOfTy` of the field's non-null type, then `variantStructHeapTwinAt`.

| site | answers by name | differ |
| --- | --- | --- |
| `armTwinRowName`, the arm field's element name | 43 programs | 17 |
| `armFieldStructRow`, the in-flight arm mint's gate | — | 0 |

All 17 differences go one way. The name rung answers `""` for an inline arm spelling (`{f:i32|null}`,
`{f:i32}`, `{w:string}`), and the type finds the arm. The twin row the type finds carries the same
spelling, so the recorded element name does not move.

## The change

`armFieldStructRow(fty)` and `armTwinRowName(fty)` take the field's type. `internInlineShapeTyGo`
passes `fldTy` to both, in lane E's file: two call lines, no other change there. The `variantIndexOf`
inside `armFieldStructRow` goes, and `variantIndexOf` has 18 code sites.

## `structRowOfAnnTyGo`'s nullable branch

Lane I's floor audit failed this branch as mechanism. `structRowOfAnnTyGo` answered -1 for a
nullable annotation type, so each caller fell through to its next rung (`nulBaseStructRow` in
`paramStructIndex`). It now steps through the `| null` and answers the non-null part's row,
consistent with `structRowOfValueTy`. Switched alone against #7671's first head, the sweep is
24,196 same, byte-identical, so the -1 never decided a module.

## Proof

- Refresh ×2 is a fixpoint at 6,716,460 bytes, against master's 6,716,446.
- Sweep against master's fixpoint seed: **24,196 same**, 0 bytes-only movers, 0 output movers.
- lint-self is clean, and `regress.vl` lost no runs.
- Witnesses `--strict`: 4,860 as filed, 0 moved.
- Late demands 8, seed +1.9%, render-parse 9 and 8, and dead exports 0.
- `vkind-census --slots-list` name producers: struct 2 (`structIndexByName`, and
  `structRowOfSpelling`, which is lane I's), variant 1 (`variantIndexOf`).
