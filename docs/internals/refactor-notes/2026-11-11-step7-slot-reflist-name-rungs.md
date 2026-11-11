# Step 7 slot layer: two ref-list name rungs deleted, and an anonymous ref-list field records its element type, 2026-11-11

This is queue item 2 of the slot-layer lane: the ref-list bank's name-keyed producers,
`rlSlotByName`, `rlSlotByNameK` and `rlRowOfNameMinted` (`2026-11-10-step7-vkind-census.md` §2).
`calleeAnnRetRefListSlot` stands by design (ruling recorded in
`2026-11-11-step7-slot-variant-name-rows.md`). Base is master `e7ebdb52` (#7117). Its fixpoint
seed is 6,615,085 bytes.

## `rlSlotByName`'s callers, measured

The probe compilers were built by the base seed into scratch. Each was validated by a reach
variant and swept over the whole population (23,868 programs). Counts are **programs**.

| caller | what it asks | reached (base) | after this PR |
| --- | --- | --- | --- |
| `arrLitInstElemRow` (`emit_classify.vl`) | does the instance's record row have a list row? | 0 | asks `rlSlotOfTyOrTwin(sTyIx[si])`: its consumer `arrLitRowTyIn` takes the row's `sTyIx` as the element type |
| `sFieldRefSlot`, untyped field: by name | the slot stored under the field's element spelling | 0 answers | deleted |
| `sFieldRefSlot`, untyped field: declared row | the type of the row named `#anonN` | 2 (`D14783`, `hole-field-anonymous-record-list-no-declared-row.vl`) | 0, then deleted |
| `sFieldRefSlot`, untyped field: name mint | `rlNameMint(nm)` | 2 (`T\|K`, `""`: template fields at a type parameter) | stands |
| `collectFrameLeafRow` (`emit_collect.vl`) | `"string[]"`, `"f64[]"`, `"i64[]"` from `arrLitFrameLeafRow` | — | stands: a closed primitive vocabulary, not a render |
| `rlRowOfNameMinted` | the name mint's lookup and re-lookup | — | stands, with the mint above |

**Why the declared-row rung was reached.** An anonymous literal row's ref-list field (code 5)
recorded its element type from the record type's field (`shapeFieldElemRow`). Where that field
is a hole, the type is -1. The field is keyed by its leading literal's `#anonN` row anyway
(`anonRefListFieldKey`), and that row's type is known where the key is computed. The fix is #7111's
pattern: `anonMintRowFor` records that row's `sTyIx` as the element type when the record type gives
none (`anonRefListLitElemTy`). After the fix, the rung is reached in 0 programs. The by-name rung
was never the answer, so both are deleted. The name-mint rung's later re-lookup is idempotent,
because `rlRowOfNameMinted` reads the slot before it mints.

## The price, measured

`sweep.vl diff` of base against the candidate's fixpoint seed, run after each step (the recording,
then the deletion): **23,868 same**, 0 bytes-only movers, 0 output movers, 0 `runs → not-runs`, 0
new compiler traps.

`rlRowOfNameMinted` had the doc comment of `rlRowOfTyMinted` above its own. The two are now in
order. That change is comment-only and gives a byte-identical seed.

## Proof

- Refresh ×2 is a fixpoint at 6,615,227 bytes (+142).
- lint-self is clean and rep-fuzz is exact.
- The seed-size, late-demands (6), dead-export, render-parse (39 and 70, unchanged), pin-helper and
  plumb-shape budgets are ok.
- cases_wasm (7,436), the inventory refs and rows tests, `vl_probe_rollback_test.ts` and
  `vl_scaling_shape_test.ts` pass.
- `check-filed-witnesses --strict` on both inventories: 4,701 as filed, 0 moved.

## What is left in the bank

`rlSlotByName`, `rlSlotByNameK` and `rlRowOfNameMinted` now serve two callers. One is the
template field at a type parameter, whose element has no type to key it. The other is
`collectFrameLeafRow`'s three primitive list spellings. The first would go if a template's
field never minted a row: an instance's field does have the type.
