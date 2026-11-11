# Step 7: the rep tree's kind covers every type the flat arms do, 2026-11-11

This is the second cut of "the descriptor derives the kind once", after
`2026-11-11-step7-rep-tree-covers-nullable-lists.md` (#7174), whose gap was 5,059 cells. It stacks
on #7174.

## What changed

All of it is in `emit_rep.vl`'s rep tree. Each arm mirrors the flat arm named beside it.

| tree change | flat arm it mirrors |
| --- | --- |
| `null` and `v128` are leaves (`RtKind` gains both), projecting `nulnone` with `rdNul` 1 and `v128` | `repOfPrim` |
| a `null` element rides the i32 list, with element `i32` | `repOfArray`'s `null[]` |
| a nullable with no inner type, or over an unfilled inference hole, is the `null` leaf | `repOfNullable` |
| a doubled nullable is the single one | `repOfNullable`'s `TyNullable` arm |
| `rtNulDiscOf`: a literal takes its base's discipline; a one-member union, its member's; a doubled nullable, its inner's; a map-twin union, the niche | `repOfNullable`'s `TyLit` and `TyUnion` arms |
| `rtOfUnion` asks the numeric-literal base before the open-member and box tests, and takes the map twin before the box | `repOfTyFlat`'s `TyUnion` order |
| a box element finds its row by canon id or by key; a nullable box element also by its inner's canon id or `unRowOfNullableOver` | `repOfArray`, `repOfNulElemArray` |
| a box element with no row that joins records lists as a struct ref list, with element `struct` | `repOfArray`'s `repAllMembersObj` arm |

`never` is still an `unsup` leaf. The only tree identity that changes is a `null` or `v128` leaf
replacing an `unsup` one. The interning key is private to the tree, and `repCanonKey` does not
read it.

## The three probes

These are the probes of #7174. Each is built by the candidate seed into scratch, and each sweeps
all 23,900 programs.

| question | #7174 | here |
| --- | --- | --- |
| flat covers the type and the tree has no kind | 5,059 | **0** |
| both answer and disagree on kind, `rdNul` or `rdListElem` | 0 | **0** |
| the tree has a kind where flat does not cover the type | 0 | **0** |

On this population the two derivations now give the same answer for every type `repOfTy` is asked
about. The next cut is to read `rdKind`, `rdNul` and `rdListElem` from the tree alone. Flat would
then keep only coverage and `rdAtom`, and its `repMk` kinds would delete.

## Proof

- **Probes:** as above, 0 / 0 / 0.
- **rep-fuzz:** exact. lint-self + fmt are clean, including the kind-ladder budget. The distilled
  `regress.vl` loses no runs. Seed-size is +0.4%.
- **The corpus identity** is the CI Sweep job's, in the PR.
