# L3: the row slot takes an inline record (D16290)

2026-11-15, lane I. The record-width rewrite (D3992) keyed a parameter's record by its declared
name, which the row slot `__R<decl>_<k>__<Record>` carried so the slot's bound could be re-derived
every pass (`T.tys` is reset per pass, so a type id cannot be kept). An inline record has no name,
so `a: { name: string }` refused any wider row whose extra fields did not sort last.

- **Key** (`wsRecKey`, `check_demands.vl`): a record is named by its declared name, or, for an
  inline record of fields only, by its spelling (`tsToName`). `wsAnnRecName` reads `R`, `R | null`
  and `R[]` through it; a hole's record (`wsHoleRecName`) is spelled from its closed inferred type
  (`tyToTs`). An inline record mentioning a type parameter is no candidate: its bound is resolved
  outside the declaration's type parameters (and such a cell already runs: `{ v: T }`).
- **Slot**: an inline record's slot is `__R<decl>_<k>__` (record part empty); its rewrite row keeps
  the spelling (`wsTpSpell`, `check_width.vl`), compacted with the row on undo. `wsTsRename`
  replaces an inline record's subtree by its spelling, as it replaces a declared record's leaf.
- **Bind**: `rowParamBind` moves from `check_row_param.vl` to `check_annot_resolve.vl` as
  `rowSlotBind`, where `resolveAnnot` lives: a declared record by `cUserTypes`, an inline one by
  `resolveAnnot(wsSlotSpelling(nm), [])`. `rowParamIsSlot` replaces the `rowParamRecordOf != ""`
  test at its two "is a row slot" readers (`wsCandidateAt`, `wsVarTy`), which an inline slot fails.
- No new lowering: the instance, the hold and the forwarding pins are the named path's.

Measured on fixpoint seeds (master `4f61400ca` vs this branch):

- `record-param-width-inline.matrix.vl` (new; the named template's cells, record inline): 11 → 28
  of 30, runs → not-runs 0, silent 0; the two left are `nested_field` and `returned` annotated
  (D16402, D16401), as for the named record.
- `record-param-width-{before,between,after}`: runs → not-runs 0, silent 0 (`hole_fwd` annotated
  moves on #8212's change). `existing-record-into-narrow-record` 59/59,
  `spread-into-rest-subtype-record` 46/46, `kept-maker-delivery-width` 125/125, no movement.
- `d16290-inline-record-param` named set, 16 cells, all `runs`.
- Pin helpers (`emit_mono.vl`): 908 → 908.
