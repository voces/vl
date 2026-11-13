# 2026-11-13 — lane H: the canon member walk counts once, its callers only where they read names

Follow-up to `2026-11-13-h-census-parent-grade.md` §2, on the grading rule the coordinator set.

## The rule

The render→parse in the canon member walk lives inside `canonUnionMembersWalk`
(check_program): it dedupes members by `canonEmitNameAt(tyToNominalName(..))`.

- **The walk is one site.** `render-parse-census.vl` adds it as `ty-string-parse` at the
  walk's last `canonEmitNameAt(` call, owner A. It counts only while the walk calls
  `canonEmitNameAt`, so it closes when A's typed dedupe (`memberTySame`) lands.
- **A caller of `canonUnionMembersInto`/`canonUnionMembersLitsInto` counts only when it reads the
  returned names.** Its third argument (the atoms list) must be used again in the same function,
  past its declaration and the call. A `[]` argument or a list never read again is not a site. A
  call whose arguments run past its line is counted.

## The effect, on master abc79a77a

| site | before | after |
| --- | --- | --- |
| check_program `canonUnionMembersWalk` | not seen (outside the emitter files) | 1 `ty-string-parse` |
| emit_collect `riuMemberTys` | 1 `ty-string-parse` (standing in for the walk) | not a site (reads only the types) |

The other seven callers read the names and stay: `memReadBoxPlan` ×2, `boxNarrowScalarKinds` ×2,
`emitBoxAtomRetagTys` ×2 (A), `msFreeSliceOfTy` (G). The `ty-string-parse` total is unchanged at
18; the baseline moves one entry from emit_collect (4 → 3) to check_program (0 → 1). The stale
`riuMemberTys` row is dropped from `render-parse-origins.txt` and `render-parse-sites.md` by hand;
the origins were not regenerated. (The `ty-string-parse` total is then 19, below.)

## Control

`tests/vl_render_parse_budget_test.ts` grades a miniature tree with a types-only caller, a
name-reading caller, a `[]` argument and a walk: only the walk and the name-reader are listed, and
a walk with no `canonEmitNameAt` lists no walk site. On the census before this change the same test
fails, listing all three callers and no walk.

## A site fed by a render by construction

`unionHasBoolLeafArm` → `boolLeafListDepthOfName` (emit_map_twins) reads arm atoms that
`unionTyArms` renders from the union's type, but the corpus probe graded it source because each
atom also appears in the program's text. The parent-grade note listed it as failing by hand. The
census now holds such sites in `RENDER_FED` (file, function, callee, ordinal), graded render over
the origins file, and fails on a key with no live site, so the entry is dropped in the PR that
converts the site (E's). Effect: `ty-source-parse` 4 → 3, `ty-string-parse` 18 → 19 (emit_map_twins
0 → 1). `ifExprNliName`, the other one listed then, is no longer a census site.
