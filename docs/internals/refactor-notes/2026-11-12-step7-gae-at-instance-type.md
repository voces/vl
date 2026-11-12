# Step 7 N13: a generic-alias application interns at its instance type, 2026-11-12

`gaeEnsure` minted the row of an application (`Box<i32>`) from its spelling. It substituted the
argument text into each declared field (`gaeApplyFieldTy` → `monoSubstAnn`) and coded the
substituted spellings one by one. Now it takes the application's checked instance type from its
caller and interns that record through the ordinary inline-shape walk
(`internShapeDeepTy(render, ty)`). An instance type that still holds a type variable interns
nothing.

## Census

Over the sweep's 24,072 programs:

- **The spelling mint was mostly redundant.** With `gaeEnsure` minting nothing, 42 programs stop
  running. Those are the `mty_*` apparr / arrnulapp / gapnul / mapapp / ret grids, plus
  nullable-struct-list and union-element-list cases. The other ~250 programs that mint an
  application already got the row from typed interning.
- **The typed mint replaces it.** Interning the instance type gives 0 runs lost, 0 new traps and
  16 bytes-only movers. After the typed rung, the spelling body is reached only by 15 programs,
  every one with a type-variable instance type: generic originals over a nested application
  (`C<C<T>>`, `I<U>`, `L<T>`), or a type parameter shadowing an alias. Deleting that body
  changes nothing.
- **The instance field pre-intern was redundant.** `gaeInternAppFieldShapes` interned the
  substituted inline-shape fields first. Removing it also changes nothing, because the typed walk
  reaches those shapes itself.
- **A type rung is not a drop-in for the name rung.** Asking `structRowOfRecordTy(ty)` instead of
  `structIndexByName(name)` is not an identity cut. In 27 programs, a row of the same canonical
  type (a declared `IBox`, an `#anonN`) exists before the application mints. A type rung would
  skip the mint, and the readers that resolve the application spelling by name would miss:
  - `isSName` / `spellingHasStructRow`, about 100 programs;
  - `rlElemStructRow`, 45;
  - `elemNameIsNominalAt`, 45;
  - `structRowOfSpelling`, 5;
  - `monoArgTyNameProjected`, 2.

  Those readers are the next floor.

## Deleted

- `gaeEnsure`'s spelling mint.
- `gaeInternAppFieldShapes`.
- `gaeApplyFieldTy`, `gaeLiveParams`, `monoSubstAnn`, `monoMapKeyEnd`.
- The D2525-boundary refusal (`gaeNulParamIxOf`, `gaeNulParamListAtApp`).
- The registry's per-field tables (`gaeFieldStart`, `gaeFieldCount`, `gaeFieldNames`,
  `gaeFieldTyNames`, `gaeFieldTyNodes`).

This removes the floor named in `2026-11-12-step7-l2-gae-field-ty-floor.md`.

`gaeParamFieldNodes` stays, filled by `gaeNoteParamField`. `monoTyParamOf` survives, through
`monoNodeNamesTyParam` and `monoParamBareTyParam`.

## Closed

D12452 runs. `Bx<GB<i32>>` with a `(V | null)[]` field was a loud emit reject; the typed mint keys
the field's list slot from the type. `IdTable<GB<i32>>` and `IdTable<IdTable<Tex>>` run too. The
fixture `generics/generic-alias-nullable-param-list-at-app.vl` reads, pushes and iterates the
nullable elements, at two instances and from a return.

## Proof

- Refresh ×2 is a fixpoint.
- `regress.vl`, lint-self, cases and rep-fuzz pass, as do the budgets.
- CI's sweep `diff` job is the mover list. The expected movers are 2 output movers (D12452 and
  its fixture) and 16 bytes-only movers.
