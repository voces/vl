# Step 7 (lane D, #13 P2, D's half): four atom-kind decisions read the member's type, 2026-11-13

Lane G split the P2 set: the `valueAtomKind` calls that classified a rendered atom. Lane D took
four of them. Each now reads a type, through `boxAtomKindOfMemberTy` (emit_rep). That function
wraps `boxTagOfTy` with the two rules the atom parse had: a `null` member (type -1) is 6, and a
literal or literal-union member is -1. `boxTagOfTy` gives a literal its base scalar's in-box tag,
and the widen/narrow ladder must not treat that as a widenable scalar. Lane G's `unionArmBoxKind`
(emit_classify, its P2 step 2c) is the same function and moves to this one; emit_rep is the lowest
point in the import graph that every caller can reach.

| site | before | after |
| --- | --- | --- |
| `boxWidenAtomFor`, `boxNarrowAtomFor` (emit_obj_lit_fits) | `valueAtomKind` over member atoms | the members' types, passed index-parallel with the atoms |
| `nliAtomOfExpr` (emit_query) | `valueAtomKind(rn)` of the callee's rendered return | the callee's return type (`nodeTyIxOf(fnRet)`, else `inferRetTyIxOf`); the spelling is still the atom it returns |
| `unionHasAtomKindArm` (emit_union_casts) | `msMemberAtomsOfSet` + `valueAtomKind` | `msMemberTysOfSet` |

The widen/narrow pair still compares members by atom for identity (`strListHas`); only the kind is
read off the type. Their callers now collect member types beside the atoms: `memReadBoxPlan`
(emit_classify) through `canonUnionMembersInto`, and the retag emitters (wasmEmit) through
`unionTyArms`, `msMemberTysOfSet` and `canonUnionMembersInto`. `staleBoxFrom` pushes `TY_I32` or
`TY_F32` beside the `i32` or `f32` atom it adds.

## Measurement

MPROBE builds over the 24,070-record population compared the atom answer with the type answer at
each site:

| site | programs | decisions | disagree |
| --- | --- | --- | --- |
| `boxNarrowAtomFor` via `memReadBoxPlan` | 1,203 | 57,525 | 0 |
| `boxWidenAtomFor`, `boxNarrowAtomFor` via the retag | 2,966 | 49,160 | 0 |
| `unionHasAtomKindArm` | 56 | 329 | 0 |
| `nliAtomOfExpr` (call arm) | 32 | 107 | 0 |

**Byte comparison:** master against the PR, 3,935 of 3,935 programs reaching any of the sites build
identical.

## Proof

- **Seed:** fixpoint (`cmp`).
- **Locally:** lint-self, `scripts/gate.sh`, `mono-tyaram-grid.sh`.
