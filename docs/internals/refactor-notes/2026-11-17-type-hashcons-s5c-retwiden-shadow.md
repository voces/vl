# Type hash-cons stage 5c, the shadow: a widened result's key against its set id (lane H), 2026-11-17

When a widened call keys its instance, mono appends `"=>" + tyToStr(retWidenTy)`
(`monoMakeInstanceGo`, D14941). This is the last `tyToStr` in mono's key, and stage 5 moves it to
the result's set id (5a's note). Unlike 5b's discriminator, which was already `tyCanonKey`, this
spelling and the set id can disagree in both directions. The move can therefore merge or split
instances, so a shadow comes first. This PR adds the shadow only; the key is unchanged.

## The shadow

`retWidenShadowNote(prefix, spelled, ty)` (`emit_ty_seal.vl`) runs where the suffix is appended.
Per key prefix (the key before `=>`) it counts:
- **split**: one spelling meets two set ids. The move would split an instance that today's key shares.
- **merge**: one set id meets two spellings. The move would merge instances today's key keeps apart.
- **merge-ne**: a merge whose two types `tyEqSealed` (ordered) tells apart. A set id ignores union
  order and repetition, but box tags are positional, so these two results' reps may differ. This is
  a veto.
- **fold-storage-differs**: a merge whose two types are stored apart. Storage is the rep id
  (`CF_LAYOUT`, provisional before the variant shapes are primed) plus the function leaves'
  tagging. STORE asked for this one: a fold of two distinct keys must not join two storages, so a
  later rep change (a closure against a set id) cannot turn a fold into a clause-1 trap. This is
  also a veto.

`canonShadowReport` writes one `canon ret5c notes N split S merge M merge-ne X fold-storage-differs
F` row per program, plus up to 24 example rows. The spelling the shadow compares is `tyToStr` at
the call site, not `retWidenKey`, so the shadow measures the same thing after the switch.

**The control.** `tests/cases/closures/generic-returned-union-alias-result.vl` delivers one generic
function value at `(r: { k: U }) => U` and at `(r: { k: i32 | string }) => i32 | string`, where
`type U = i32 | string`. The two widened results share a set id, but their rep ids differ (a union
alias keeps its own rep id), so the shadow reports `merge 1 fold-storage-differs 1`.
`tests/vl_ret_widen_shadow_test.ts` pins that, and also pins the corpus merge below, which must
report `merge 1 fold-storage-differs 0`. A spelling-keyed or set-keyed key alike builds the control
program correctly today.

## Measurements

| reading | value |
|---|---|
| seed | fixpoint, branch and base (master 3f567259f) |
| population | 20,296 files (`tests/cases` outside `modules/`, `distilled/cells`, `distilled/named`, `compiler/entry.vl`); 15,798 reach emit |
| programs with a note | 52 |
| notes | 297 |
| split | 0 |
| merge | 1 |
| merge-ne | 0 |
| fold-storage-differs | 0 (re-run on master after #8908: 20,297 files, 15,799 reach emit, the same 297 notes) |
| identity, shadow off | 3,223 / 3,223 capability-list files byte-identical |

The one merge is in `tests/cases/closures/generic-returned-record-param.vl`: `(R) => K` against
`({k: K}) => K`, where `type R = { k: K }`. One result type is spelled through its alias and once
unrolled, and `tyEqSealed` calls the two equal, and the two are stored alike (rep id and tagging
equal). The move would build one instance where today there are two.

## What 5c still needs

The switch, in its own PR: replace the suffix with the set id, then grade it by identity (the one
merge changes that program's bytes), `regress.vl`, and the merged program's output.
