# Step 7, lane H: P1 part 1, value-union-ness asked of the type, 2026-11-13

P1 covers the census's `isValueUnionName` sites that parse a render (16 sites, plus
`litUnionArmValueUnionRetName`). This part lands the four sites where the type gives exactly the
name's answer.

## Probe and decision table

At each site, the name's verdict (`isValueUnionName(name)`) was compared with the type's
(`isValueUnionTyOr` on the type the name was rendered from), over 24,207 programs. The verdicts are
name / type, with `d` where the type declines.

| site | name / type, programs | outcome |
| --- | --- | --- |
| `collectARefArrayAnn` (`emit_collect`) | 1/1 in 280; never differs | type |
| `fnRetNullBearing` (`emit_nullable_rets`) | 0 vs d on a non-union (156); 1 vs d on a list union (2) | type; the name only where the type declines |
| `ifExprNliName` (`emit_union_atoms`) | no type; the name is a join of atoms whose kinds the function computes | kinds |
| `valueUnionNameOfSoftTy` (`emit_union_atoms`) | no type parse needed; the name is a join of the members' primitive names | kinds |
| the other 9 sites and `check_ret_names` | disagree on literal members | part 2 |

**Candidate A applied the type at every type-holding site, and it is refused.** Swept against
master, it moved 28 programs from runs to not-runs, 15 of them new traps, all in the literal-union
family. The name predicate grades a literal member by how its site's spelling writes it:
- the key text and `unionSpellingOfTy` write a literal set at its base, with no dedup;
- the inferred-return names write a literal or an alias arm, which `valueAtomKind` does not call
  an atom.

`isValueUnionTyOr` follows neither convention. Part 2 adds one type predicate per convention.
The semantic question is D16062: its three ablation families, each with a minimal witness. The
type twin also answers no for a mixed-base literal union (`"a" | 1`) that boxes.

## The change

- **`valueUnionTyVerdict(ty)`** (`check_ty_rep`): `isValueUnionTyOr` over any type, 0 for a
  non-union, -1 where a member declines.
- **`collectARefArrayAnn` and `fnRetNullBearing`** read that verdict. The name is parsed inline
  only where it declines, so the census still sees that fallback.
- **`ifExprNliName` and `valueUnionNameOfSoftTy`** decide with `valueUnionFromAtomKinds`, now
  exported, over the kinds they already hold. It is the same ladder `isValueUnionName` runs on the
  joined name.

**Measurement** (`sweep.vl diff`, fixpoint seeds, master `6ec3ca16` against candidate C, which is
this change before the fallback was inlined; the inlined form is the same logic): 24,207 same, 0
bytes-only movers, 0 output movers.

**The census after regeneration:**

| | before | after |
| --- | --- | --- |
| `ty-string-parse` | 69 | 64 |
| `ty-source-parse` | 25 | 21 |
| `ty-parse-unclassified` | 55 | 59 |

What moved:
- **Gone:** the two `isValueUnionName` sites in `ifExprNliName` and `valueUnionNameOfSoftTy`.
  `armMintShapeName`'s two sites were deleted on master (#7744).
- **Render to unreached:** `collectARefArrayAnn`'s fallback, which no program reaches.
- **Source to unreached:** four `nameIsGenAppDecl` sites (`emit_shape_rows`), unreached since #7747.

The unclassified count rises only by sites that became unreachable. They are deletion candidates,
and the baseline is rewritten here with that reason.
