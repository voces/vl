# Type hash-cons stage 6b, batch 6: twenty-one type walkers on a path stack (lane H), 2026-11-16

This batch continues the visited-set walkers (`2026-11-16-type-hashcons-s6b5-union-walk-caps.md`) with
one mechanism for every shape of query.

## A path, not a visited set

6b-5 kept a visited list for existence queries and a path for its one all-members query. This batch's
walkers mix three kinds:
- existence queries;
- all-members queries (`holesOnlyInFns`, `tyHolesOnlyInTopFnSigs`, …);
- collectors that fill an `out` list (`riuFlatMembers`).

A shared visited list is wrong for the last two whenever one union is reached by two branches. A
**path** is right for all three. Each union or record row is pushed when the walk enters it and popped
when it leaves (`tyPathEnter`). Only a cycle back to a row still open short-circuits, and it returns
exactly what the old cap returned on exhaustion (`false` for 19, `true` for `elemTyIsNominalAt` and
`ihBearsStrLit`). So no answer can change except on a recursive type deeper than the old cap.

Each walker `F(…, depth)` becomes three functions:
- `F(…)`: the wrapper;
- `FIn(…, path)`: enters the path, calls the body, pops;
- `FBody(…, path)`: the old body, its recursive calls going to `FIn`.

A scratch script made the change (in the session scratchpad, not committed). It reads each guard's
return value as the cycle answer.

## The walkers

`holeOutsideFn` (`check_fit_rules.vl`) · `nestTyHas` (`check_subst.vl`) · `tyHoldsNoFn`,
`holesOnlyInFns` (`check_assignable.vl`) · `tyHolesOnlyInTopFnSigs` (`check_cstr_rows.vl`) ·
`lamLitResult` (`check_fn_decl.vl`) · `holdsHoleFn` (`check_leaf_steps.vl`) · `luHasView`, `luHasLit`
(`check_list_union.vl`) · `tyHoldsOpenMap` (`check_narrow_flow.vl`) · `inlayHoleDeep`
(`check_redundant_annot.vl`) · `tyPrintUnionArmsInDomain` (`check_ty_rep.vl`) · `structLitUnionFieldAt`
(`emit_base.vl`) · `tyNamesDeclaredParam` (`emit_classify.vl`) · `riuFlatMembers` (`emit_collect.vl`) ·
`elabKeyHeldGenericGo` (`emit_elab.vl`) · `tyReachesFuncD` (`emit_obj_lit_fits.vl`) · `repBoxesTy`
(`emit_rep.vl`) · `elemTyIsNominalAt` (`emit_shape_rows.vl`) · `tyHasNumLit` (`emit_variant_sig.vl`) ·
`ihBearsStrLit` (`iface_hash.vl`).

None of their cap sites fired in the 6a census.

**Left out:**
- `monoTyHasFieldRecord` and `monoTyHoldsGradual` (`emit_mono.vl`): the transform adds two functions
  each, and `emit_mono.vl`'s function count is the pin-helper budget.
- The pair walks (`fnShapeClash`, `recCopyNarrowsAt`, `fvaHeldHoleFnDiffers`, `frsClosesHoles`).
- `valueUnionFlatten`, which takes a list.
- `widenScanFinds`, whose type is not the first argument.
- `valueBoxArmsInto` and `btSoftMembersGo`: their second guard is semantic and fired in the census.
- The walkers whose depth reaches another function.

## Census

The phase-state census lists the type arena's structural accessors in `TY_ARENA_API`, outside each
module's checker surface. `tyPathEnter` reads a row's kind by type id, so it joins that list, which is
the route the census header gives for a new accessor. The nine emit files that call it then raise no
surface.

## Measurements

| reading | value |
|---|---|
| seed | fixpoint, branch and base (master 0ba90ffdb); every refresh exits 0. The comment rewording afterwards leaves the seed byte-identical |
| identity | 2,827 of 2,827 byte-identical: the 2,000-file sample with `compiler/entry.vl`, 800 union, literal and nullable cases, and every recursive or cyclic corpus file |
| probes | the eight recursive-type programs of 6b-4 and 6b-5 terminate and print the same |
| guest fuel, fixed input | 92,402,820,201 → 92,407,331,564 (+0.005%) |
| net compiler lines | +340 over 21 files: three functions where there was one, at about 15 lines each |
