# Step 7 L2: a bare type-parameter annotation is read from its type (40 → 39 parses), 2026-11-12

Lane E (w310's area: `emit_base`'s spelling predicates and the D6 interner). `monoTyParamOf(ann,
typarams)` answered which type parameter a parameter annotation `T` or `T[]` rides on by cutting
the `[]` off the annotation's spelling (`nameIsArray`, one render-parse site). Its callers were
`monoParamBareTyParam` (`value_reach`, read by `monoParamIsOpen` and two `emit_mono` binders) and
`monoNodeNamesTyParam`, whose input is an `Ident` in `T.field` and never needs the `[]` rung.
`emit_mono` already held a typed twin, `monoAnnTyParamOf`, for two other callers.

## Probe

A scratch compiler, never refreshed into a seed, compared `monoParamBareTyParam`'s spelled answer
with the typed one (`TyVar`, or a `TyArray` of one, matched by name) on every reach, and raised a
distinctive `emitFail` on disagreement. Control: a reach tag fired on a two-line generic program.
Over the sweep's 24,170 programs the two disagreed in 10, all of one family: a nested generic that
redeclares its enclosing function's `T` (D3081, D3840, D3853, D15263 and six
`generics/nested-generic-*` cases). There the enclosing function's rows are renamed apart to
`T__sh<slot>` by `monoShadowRenameDecl`, so the type names `T__sh1` while `typarams` holds `T`.
`monoAnnTyParamOf` already maps the rename back; the plain `TyVar` read did not.

## Changed

- `emit_base.monoTyParamOfTy(ty, tps)` is `monoAnnTyParamOf` moved down, reading the rename
  through a table `emit_base` owns (`tyParamShadowNote` / `tyParamShadowReset`, written by
  `monoShadowRename` beside its own arrays). `monoAnnTyParamOf` is deleted; its two callers take
  `monoTyParamOfTy`.
- `monoParamBareTyParam` reads the parameter annotation's recorded type through
  `monoTyParamOfTy`; it no longer asks `monoDeclAnnName`'s raw spelling.
- `monoTyParamOf(name, typarams)` keeps only the exact-name rung `monoNodeNamesTyParam` uses; its
  `nameIsArray` parse is deleted.

## Proof

- Refresh ×2: fixpoint at 6,735,329 bytes (base 6,735,476).
- Sweep, fixpoint seeds on both sides (master `cf01f012`): 24,170 same, 0 bytes-only movers,
  0 output movers, 0 `runs → not-runs`, 0 new compiler traps.
- `scripts/gate.sh`: all 23 rows pass (seed size, late demands, plumb-shape cost, rep-fuzz, filed
  witnesses, the distilled corpus, render-parse, scaling shape among them).
- Render-parse with `--findings`: 12 renders, 40 → 39 parses (`emit_base.vl` 17 → 16);
  `--write-baseline` is in this PR.
