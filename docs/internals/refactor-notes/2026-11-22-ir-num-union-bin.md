# IR coverage: operators over a numeric union on legacy's `numUnion` route (2026-11-22, lane IR-N7)

`operand type`, split by `eqRouteOf`'s answer on master dfc71b02, has 62 `tests/cases` functions
on the `numUnion` route: an operator (`+` 27, `*` 11, `==` 11, `/` 8, `<` 4, `%` 1) with an operand
whose type is a union of numbers. This is the second route of the class, after `nulNiche` (#9476).

## Design

- **Plan and tails (`wasmEmit.vl`).** Legacy's `emitNumUnionBin` is rewritten over shared pieces,
  and the IR writes the same ones:
  - `numUnionStashEnter` / `numUnionStashLeave`: the stash key and the nesting depth around the
    sides;
  - `numUnionStashTail`: a side's slot, the box for a union side or the side's kind for a scalar,
    set from the stack (`njStash` now ends in it);
  - `numUnionBinTail`: the member dispatch over the stashed slots.
- **Admission reads legacy's own answers** (R8): `numUnionIsUnionSide` (`njMembersOf`),
  `numUnionSideBoxed` (`exprUnion`), `numUnionSideLit` (`cexLitPeel`), and `numUnionSideKindOf` /
  `numUnionSidePrim` (`njKindOfTy`, the kind `njKindOfExpr` stashes at).
- **`RNumUnionBin { nbArgs, nbAt }`**, routed where `eqRouteOf` answers `numUnion`. Its args are
  the non-literal sides in order; a literal side is written at each member's width, so it has no
  operand.
  - A union side legacy boxes at the stash (a join of scalars) is the named miss `numeric union
    side box`; a scalar side not already at its kind is `numeric union side coercion`.
  - Family `other`, so claiming does not widen.

## Measured

Against master a00578d1's fixpoint seed:
- the 35 `numUnion` witness files go from 401 to 445 functions covered = verified = matched, with no
  mismatch;
- all of `tests/cases` goes from 67,544 to 67,588 matched, and the one mismatch is the same at base.

The row `tests/ir-shadow-rows/numeric-union-bin.vl` has 8 functions, three of them an operator
nested in a union side; all 8 are `operand type` on master's seed, and here all 8 are covered and
matched. The full table is in the PR body.
