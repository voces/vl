# Step 7 L6: the canonical type key's recursive text no longer depends on the walk's origin, 2026-11-11

The union registry census (`2026-11-11-step7-union-registry-census.md`, cut order item 2) found
that the canonical key (`unTyKey`) is not one text per type when the type is recursive. A member
on a cycle keys its back-reference by type id (`^k`, k steps up the walk's path). A type spelled
with the alias's members unfolded closes its cycle on a different id, so one regular tree got two
texts: `[(^1 ; null ; string)]` and `[([^1] ; null ; string)]` (D4140's
`unions/recursive-alias-unfolded-list-is-alias-list.vl`, 14 splits in 2 programs). Every later
cut that re-keys a site meeting a recursive alias needs this first.

The base is master `98b73ba7`, with a fixpoint seed on both sides.

## Changed

- **A cyclic member is re-keyed over structural classes** (`utkCycText`,
  `emit_union_tykey_text.vl`). The walk is unchanged for an acyclic member, and it now notes
  whether it wrote a back-reference. When it did, the member's union and list nodes are gathered,
  merged by bisimulation (partition refinement on kind, leaf texts and children's classes; a
  union's children are a multiset, never deduped), and the text is written again with the
  path holding classes, not ids. Two nodes whose unfoldings are the same tree are one class, so
  the back-reference closes at the first equal node, whichever id it is.
- **The acyclic text is unchanged.** A node of a finite tree is never bisimilar to a node below
  it, so with no cycle the class walk writes exactly the id walk's text. Only texts that held
  `^` can move.

## The reading

A probe compiler, built in the scratchpad and never refreshed into a seed, logged every registry
row's key and every `unRowOfTyKey` lookup whose key holds a back-reference, on D4140's fixture:

| | rows | lookups `[(^1 ; null ; string)]` | lookups `[([^1] ; null ; string)]` |
| --- | --- | --- | --- |
| master | 3, unchanged | 22 | 4 |
| candidate | 3, unchanged | 26 | 0 |

The key is read only at the mint adopts and the 18 sites #7131 switched, and neither meets these
4 lookups with a row the change would retarget, so the expected movers are none.

## Proof

- **Bytes.** The 120 `tests/cases` programs declaring a recursive list alias that build, under
  the master fixpoint and the candidate fixpoint: 120 of 120 byte-identical. The sweep (label
  `sweep`) grades the whole population.
- **Locally:** refresh ×2 byte-identical, rep-fuzz (exact), lint-self (clean), seed-size (+0.5%),
  late-demands (6, the baseline), and the dead-export, render-parse and pin-helper budgets,
  cases_wasm, inventory refs/rows, `check-filed-witnesses --strict` on both inventories,
  `vl_scaling_shape`, `vl_probe_rollback` and plumb-shape-cost (fuel).
