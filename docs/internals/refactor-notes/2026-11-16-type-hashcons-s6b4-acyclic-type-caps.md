# Type hash-cons stage 6b, batch 4: fifteen type walkers that cannot meet a cycle (lane H), 2026-11-16

This is the first type-walker batch of 6b, approved by the coordinator file by file. It covers the
caps that need no visited set at all.

## Which walkers cannot meet a cycle

A cycle of VL types passes through a union alias row or a record. A recursive alias is a union row
(`type L = i32 | L[]`), or a one-member union placeholder (`type M = {[string]: M}`), or a record
field (`type T = { next: T | null }`). A walker that steps only through list elements, nullable
inners, map keys and values and function parts therefore stops at the first union or record row it
meets, so it cannot loop. That holds only if it never peels a union into one of its members, which
is what `nonNulTyOf`, `tyNulInnerTy`, `memberNumSoft`, `unionSoleMember` and similar do.

Of the 103 never-firing caps in type walkers, a classifier finds:

| class | caps |
|---|---:|
| recurses into record fields or union members (needs a visited set) | 57 |
| does not (the candidates here) | 30 |
| compares a pair of types through records (needs a pair memo) | 7 |
| builds a type through records | 5 |
| depth not the last parameter | 4 |

Of the 30, these were set aside:
- six that peel a union (`tyParamsOnly`, `tyHolesOwnedBy`, `glistLeafKey`, `jrSpelledAlike`,
  `tyEqNoneIsMap`, and the regex hit on `litListTyClosed`, which turned out false);
- the ones whose depth is not used only by the guard and their own recursion;
- `fieldStorageEq`, which hands its depth to `recMapStorageEq` and reads through
  `nullableInnerOrNone`;
- `ftListLeavesOfSet`, whose second guard `depth == FT_HOLD_DEPTH` means "at the top level". It is a
  rule, not a budget, and that cap fired in the census.

That left fifteen:

`elabListLeafIsFn` (`check_elab_cap.vl`) · `ftTyVarShaped` (`check_fn_tag.vl`) · `nulFoldTiedTyAt`
(`check_relate_core.vl`) · `substLeafIsPrim` (`check_subst_fold.vl`) · `listJoinStorageDiffers`
(`check_ty_relate.vl`) · `elemStoreClassOf` (`check_ty_rep.vl`) · `tyPinsEmptyHoles`, `tyRepVaries`
(`check_types.vl`) · `recordShapesOneRow` (`emit_collect.vl`) · `litListTyClosed`, `litOpenListTyAt`,
`elabArgTyAt` (`emit_elab.vl`) · `monoLamPinName` (`emit_mono.vl`) · `ihTyClass` (`iface_hash.vl`) ·
`trcGo` (`record_rows.vl`).

None of their cap sites fired in the 6a census. Each loses its guard term and its depth parameter at
every call site. One multi-line call ended in a trailing comma, which the rewriter mishandled, and the
refresh caught it.

## Termination probes

Six programs use a recursive type through a list (`i32 | J[]`), a map, a record of lists, a nullable
record chain, a function, and a list of a nullable recursive alias walked recursively. Each
terminates and prints the same under master's seed and this branch's.

## Measurements

| reading | value |
|---|---|
| seed | fixpoint, branch and base (master c144bf3f1; master 8492d1704 changes no compiler file); both refreshes exit 0 |
| identity | 2,109 of 2,109 byte-identical: the 2,000-file random sample with `compiler/entry.vl`, plus every corpus file whose name says recursive, self-referential or cyclic |
| guest fuel, fixed input | 92,075,509,252 → 92,074,280,570 (−0.001%) |
| net compiler lines | −15 over 18 files |
