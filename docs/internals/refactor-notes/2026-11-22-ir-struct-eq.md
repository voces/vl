# IR coverage: `==`/`!=` over records on legacy's `structEq` route (2026-11-22, lane IR-N7)

`operand type`, split by `eqRouteOf`'s answer on master dfc71b02, has 37 `tests/cases` functions
on the `structEq` route: a `==`/`!=` legacy writes as a field-wise compare over a struct row. This
is the third route of the class, after `nulNiche` (#9476) and `numUnion`.

## Design

- **Plan and tails (`wasmEmit.vl`).** Legacy's `emitStructEq` is rewritten over shared pieces, and
  the IR writes the same ones:
  - `structEqStagesLeft` / `structEqStagesRight`: whether an operand is evaluated once into a
    stash (no re-readable place, or the right is stashed), split out of `structEqStage`;
  - `structEqEnter`: the stash slots saved before staging;
  - `structEqRoots`: the stashed operands' slots set from the stack, right first, and the roots;
  - `structEqTail`: the field-wise compare over the roots, the slots restored, `i32.eqz` for `!=`.
- **An operand legacy re-reads** (a place) is read at every field from the root. A variable's
  read is one `local.get` of its slot, so the IR gives `structEqRoots` that slot as the root, and
  every chain read writes the bytes legacy writes for the variable. A field or index place is the
  named miss `record compare place operand`.
- **`RStructEq { seL, seR, seAt }`**, routed where `eqRouteOf` answers `structEq` (R8). The
  verifier holds both operands at references and the answer a bool. Family `other`, so claiming
  does not widen.

`variantEq` goes through the same `emitStructEq` over a variant's row; it is the next PR.

## Measured

Against master 898b840d's fixpoint seed (lane IR-N8, which took the branch over from IR-N7):
- `tests/cases` covered = verified 68,120 → 68,142 (+22), matched 68,119 → 68,141, no new fail or
  mismatch row; the corpus is unchanged at 45,028;
- the 25 `structEq` compares left are `record compare place operand`: a field or index place
  legacy re-reads at every field;
- `ir-identity --cases`, `--claimless` and `--names` differ 0; the legacy A/B over `tests/cases`
  differs 0;
- L2 fuel +0.12% per PR, all source growth: the head seed compiles the base tree within +0.0004%
  of the base seed's fuel.

The row `tests/ir-shadow-rows/record-struct-eq.vl` has 7 functions; 6 are `operand type` on
master's seed, and here all 7 are covered and matched.
