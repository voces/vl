# The phase-state census does not count the type arena's accessors as checker surface, 2026-11-15 (lane Q)

## The problem

Lane H's type-hash-cons stage 2b (`lane-h-s2b-hole-rows`) routes list-element, map-key and
map-value reads through four new `check_types.vl` exports: `tyElemOf`, `tyKeyOf`, `tyValOf` and
`tyOpen`. Before, each was a raw field read (`t.aElem`). The `surface` metric of
`scripts/phase-state-census.vl` counted every one of those imports as checker surface, and the
ratchet failed.

The metric is meant to catch mono and emit re-deriving checker facts. Reading a type id's child is
not that. The type arena is the session's interner (`2026-11-14-phase-products-design.md` §2.1),
and lane H is moving it out of the checker.

## The rule

- `TY_ARENA_API` in the census lists the arena's structural accessors: a child, its openness, its
  pin. They are exported from `check_types.vl`, and an import of one counts as `arena`, which is
  printed but not ratcheted, instead of as `surface`.
- **The list cannot go stale.** A listed name that `check_types.vl` does not export stops the
  census, with exit 2.
- **Who extends it:** the PR that adds an accessor lists it in the same change.
- **The list is temporary.** When the arena has its own module (lane H stage 3, the intern table),
  the census classifies that module as session state by file, and the list deletes.

The list holds only names on master: `tyPinElem`, `tyPinKey` and `tyPinVal`. Lane H's 2b PR adds
its own six (`tyElemOf`, `tyKeyOf`, `tyValOf`, `tyOpen`, `holeReset`, `declKeyOf`) to
`TY_ARENA_API` in place of raising the `surface` baseline.

## Counts

The `surface` line, with `arena` beside it, on master `5683d3b2c` and on
`lane-h-s2b-hole-rows` (`37e00bc35`):

| classification | master: surface / distinct / arena | H 2b: surface / distinct / arena |
|---|---|---|
| today's rule, no list | 2,789 / 1,166 / 0 | **2,876** / 1,170 / 0 |
| **this PR's rule, with H's six names added** | 2,789 / 1,166 / 0 | **2,789** / 1,166 / **87** |
| wider: also `tyAt`, `mkPrim`, the 15 `TY_*` builtins | 2,687 / 1,154 / 102 | 2,687 / 1,154 / 189 |

- **The rule makes H's 2b neutral.** It moves 87 imports of 4 symbols out of `surface`. The
  coordinator's +86 was measured on an earlier push of the branch.
- **The wider set is the module-based end state.** It is not taken now. The `TY_*` builtins are
  `let`s, not functions, so they would need a second check. `T` is not in either set, because it
  also carries `T.diags` and the checker's frames, which are checker state.
- The master figure is one import below the committed baseline. That fall is #8125's, not this PR's.

## Control

`tests/vl_phase_state_test.ts` gains a miniature with a `check_types.vl` exporting the three
`tyPin*` accessors and one judgement. An emit module imports one accessor and the judgement, and
the census reports `surface 1 … beside 1 imports of the type-arena accessors`. With `tyPinKey`
removed, the census exits 2 naming it.
