# Step 7: the rep tree's kind covers every nullable list, and the two derivations measured, 2026-11-11

This is the first cut of "the descriptor derives the kind once". `2026-11-10-step7-vkind-census.md`
§1.2 says `repOfTyFlat` builds `rdKind` through its `repMk(kind, …)` arms, and that `repOfTy` then
overrides it with the rep tree's projection, `repTreeVKind`, wherever the tree has a kind. Base is
master `fae58534` (#7159).

## The two derivations, measured

Probes sit at `repOfTy`'s override point. Each is built by a candidate seed into scratch, and each
sweeps all 23,894 programs. The control is an unconditional `emitFail` at the same point; it fires
in 941 of the 1,195 programs of shard 1/20.

| question | base | after this change |
| --- | --- | --- |
| both answer and disagree on kind, `rdNul` or `rdListElem` | 27 cells, all `u8[] \| null`'s element name | **0** |
| the tree has a kind where flat does not cover the type | 0 | 0 |
| flat covers the type and the tree has no kind | 5,278 cells (below) | 5,059 cells |

So the tree is a strict subset of flat: it never covers more, and where both answer they agree.
One derivation therefore needs only the tree's gaps closed.

The gaps on base, by flat kind:

- `nulnone` (the `null` type), in 4,750 cells;
- `nulreflist`: 260 cells, across many element shapes;
- `i32` for a standalone `u8`: 134;
- `list` for `null[]`: 54;
- `v128`: 39;
- `union` with `rdNul` 4, a nullable value union: 21;
- `nulstrlist` over `(string | null)[] | null`: 6;
- `reflist` over a box element with no registry row: 7;
- `map` for `{[i32]:i32}`: 4.

## What changed

- **`rtNulVKind`'s list arm** is now `rtNulListOf(rtListVKind(elem))`: the nullable niche of the
  list kind the tree already gives the element. Every element kind the list layer covers gets
  its nullable list, including a ref or nested-nullable element. The arm used to name six scalar
  elements and decline the rest.
- **A standalone `u8`** projects to `i32`, the value it widens to, as flat's `repOfPrim` says.
- **Flat's `u8[] | null`** names its element `u8`, as `u8[]` does. It used to say `u8list`. `repOfTy`
  already returned the tree's `u8`, so no answer it gives moves.

None of this changes a tree node or a canonical key. Only the projections onto `VKind` read
further.

What is left for the next cut needs new tree leaves, or a box without a registry row:

- `null`, `null[]` and `v128`;
- the nullable value unions;
- `(i32 | null)[]` with no box row;
- `{[i32]:i32}`.

## Proof

- **Probes:** 0 disagreements, and 0 types the tree covers that flat does not, over 23,900 programs.
- **rep-fuzz:** exact. lint-self + fmt are clean. The distilled `regress.vl` loses no runs.
- **The corpus identity** is the CI Sweep job's, in the PR.
