# D9073: the destination binds a type parameter only the result names

2026-11-15, lane K. The return-only face of the D16410 ruling ("the expected type binds a callee
type parameter that no argument binds"). `mk<T>(): T[]` at `const xs: string[] = mk()` was
refused by `checkRetTyParamBound`; it now binds `T` from the destination, through the D16410
mechanism. There is no second path.

- `dstBindOpenFnTyParams` (`check_assignable.vl`) also binds a name no parameter mentions, when it
  is one of the callee's own declared type parameters (`declOwnTyParams`). An enclosing generic's
  `T` that a nested function's result names (`inR<U>(_u: U): T`) is not the callee's, and a draft
  without that restriction broke `nested-generic-reads-enclosing-pin-positions.vl` and three
  `bundle-record-*` fixtures.
- `checkRetTyParamBound` (`check_node_rules.vl`) skips the names the call site bound. The direct
  call and UFCS paths pass their bindings; the callback path (`checkFnValueRetTyParamBound`) passes
  none, so `[3].map(cnst)` and `ap(3, cnst)` stay refused, as does a call with no destination.
- A declared return the body's call took its instance from is not redundant: `dstOpenBinds`
  (`check_core_state.vl`) is read by `fnDeclNoteRedundantRet`. Without that, `function mk2():
  string[] { mk() }` was hinted redundant, and removing the annotation is refused.

## Measurements

Before: a fixpoint master seed (`5e45620f9`). After: this branch's fixpoint seed.

- `scripts/oracle/ruling-grid.ts`: 23 of 23 cases agree; `rg_dest_return_only` prints `0`, `rg_dest_nullable` prints `true`.
- `return-only-type-param-bound-by-destination.matrix.vl`: runs 0 → 34 of 54 graded, 2 owed (the
  `.map` callback), 20 skipped. The 20 still refused are each a face with no destination type
  (`return_inferred`, un-annotated bindings): `cannot infer type parameter`. runs → not-runs 0.
- The matrices matching `*generic*`, `*hole-fn*`, `*fn-value*`, `*lambda*`, `*ret*`: no row moves.
- `deno task test` 9067 passed, 0 failed. `regress.vl`: runs → not-runs 0 of 260,649 census cells.
- lint-self clean; late demands 2 (baseline 2); seed +0.3% over baseline; rep-fuzz exact.
- `check-filed-witnesses --strict`: 5141 of 5142 as filed. The one MOVED row, D16472, is a
  host-binary fix (#8314) that the shared `vl` binary does not carry yet.
