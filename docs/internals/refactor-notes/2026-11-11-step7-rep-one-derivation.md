# Step 7: the descriptor's kind has one derivation, the rep tree, and the flat arms are deleted, 2026-11-11

This is the third cut of "the descriptor derives the kind once". `2026-11-11-step7-rep-tree-covers-flat.md`
(#7196) left the tree covering every type the flat arms do and agreeing with them everywhere. This
cut stacks on #7196.

## What changed

`repOfTy` now reads the rep tree alone. A type the tree has no kind for is uncovered. Otherwise
the descriptor is built from the tree:

- the kind from `repTreeVKind`;
- `rdNul` from `repTreeNulOf`;
- `rdListElem` from `repTreeListElemName`;
- `rdAtom` from the new `repTreeAtomOf`: an `atom` node, or a `nul` node with the atom-sentinel
  discipline.

`repOfTyFlat` is deleted, with the flat arms only it reached:

- `repOfPrim`;
- `repOfNullable`, `repOfNullablePrim` and `repOfNullableArray`;
- `repOfArray` and `repOfNulElemArray`;
- `repOfMap`.

`emit_rep.vl` had 74 `repMk(` occurrences (the census's count) and now has 7: the definition and 6
calls. Each call builds a descriptor from a kind already derived:

- the tree projection in `repOfTy`;
- `repOfListOf` (two calls);
- `repAtomMk`;
- the union-alias adjustment in `repOfNodeAt`;
- `repDescRet`.

The shadow harness's flat-against-tree leg is deleted too, since there is no flat side left to
compare. Its canon, elem and mv key checks and its coverage buckets stay.

Three readers outside flat asked it a question, and each now reads the tree:

| reader | question | now |
| --- | --- | --- |
| `btGo`'s function arm | is a function type's rep `i32`? | `repOfTy` |
| `nulScalarBoxAtomOf` | is `inner \| null` the value-union box, and what is `inner`'s kind? | `rtNulDiscOf(inner) == 4`, and `repOfTy` |
| `repOfTyAtNode` | the rep of `h[]` and `h[] \| null` for a hole's element `h`, which has no arena array type | `repOfListOf(h, nul)`, the tree's list projections over `rtGo(h)` |

`rtElemName` is split out of `repTreeListElemName` so `repOfListOf` can name an element node.

## Proof

Probes are built by the candidate seed into scratch. Each sweeps all 23,909 programs.

- **`repOfTy`, old against new.** Every field is compared (`rdCovered`, kind, `rdNul`,
  `rdListElem`, `rdAtom`, `rdSigTok`, `rdSlot`): **0 cells differ**. A control, firing wherever both
  are covered, fires in 473 of the 598 programs of shard 1/40.
- **The three rewritten readers.** The old flat functions were restored beside the new reads, and
  a probe compares them. The box question and both hole lists show **0 cells** that differ.
  - An unconditional control reaches the box question in 336 cells and the nullable hole list in
    1 cell of shard 1/10.
  - The non-null hole list is not reached in that shard.
- **rep-fuzz:** exact.
- **Other gates:**
  - lint-self + fmt are clean, including the kind-ladder budget, and the dead-export budget is 0;
  - the distilled `regress.vl` loses no runs;
  - the union-key licence and probe-rollback tests pass.
- **Seed:** 6,621,625 → 6,614,951 bytes (−6,674).
- **The corpus identity** is the CI Sweep job's, in the PR.
