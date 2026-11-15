# Type hash-cons stage 4d: the rep id, the layout id with each record's arm status (lane H), 2026-11-15

Stacked on 4c (#8298). Lane E asked for this in place of `tyCanonLayout` so that `repOf` keeps one
key discipline (their option (a), 2026-11-15).

**`tyRepId(ty)`** is 4a's layout flavour with one more argument in a record's key: whether the
record is a union arm (`repTyIsVariant`). Every record position carries it, so a list or map of
records does too. `tyCanonLayout` is renamed to `tyRepId`, since nothing else asked for an id
without the bit.

**When it is final.** The arm status reads the checker's variant members (bit 1) and the
elaboration's union arm types (bit 4). Both are fixed once `repVariantShapesPrime` has run in
`emitProgramRun` and mono's instances are in (lane E: after the passes, the corpus has 0 tree
rebuilds from either bit). So an id read before then is provisional. `rtSync`'s reset calls
`canonRepDirty`, and the next outermost id walk forgets every rep id, so an id never outlives the
tree it describes. The flag is read only at the start of a walk, because `repTyIsVariant` can
itself reach `rtSync` in the middle of one.

**Strict before final.** At lane E's request, `tyRepId` refuses through `emitFail` until
`canonRepFinal(repTyIsVariant)` runs, right after `repVariantShapesPrime` in `elabPrepareRun`.
`repReset`, the per-program reset, calls `canonRepUnready`. `tyRepIdProvisional` is the early
answer, with every record read as no arm, and the shadow uses it until the ids are final. "Final"
means the arm facts are fixed. It does not mean rows stop moving: mono's instance re-checks still
bump `tyMutEpoch`, and the stale flag re-derives the ids after each rebuild.

**No import cycle.** `emit_rep.vl` imports this module, so the arm test arrives through a function
slot, `canonArmFn`, which `canonRepFinal` binds to `repTyIsVariant`. Unbound, no record is an
arm.

## Shadow

Graded one-way against `repTreeOfTy`, as in 4a. A merge is one id meeting two nodes.

| reading | 4a (layout, arm bit at the top only) | 4d (`tyRepId`) |
|---|---|---|
| merge | 20, in `dord032` | **0** |
| split (finer, safe) | 42,261 | 42,034 |

1,839 files, the same population as 4a.

## Measurements

The base is 4c (#8298) built to its own fixpoint.

| reading | value |
|---|---|
| seed | fixpoint |
| identity, shadow off | 19,779 of 19,779 files byte-identical: all of `tests/cases` outside `modules/`, plus `distilled/cells` and `distilled/named` |
| seed size | 6,386,137 → 6,386,555 bytes (+418) |
| net compiler lines | +53 (`emit_ty_seal.vl` +52: the arm argument, the strict and provisional ids, the ready flag and the function slot; `emit_sections.vl` +2; `emit_rep.vl` −1: `rtArmBitOf` goes, the reset and the ready test come) |
| pin helpers (`emit_mono.vl`) | 908 → 908 |
