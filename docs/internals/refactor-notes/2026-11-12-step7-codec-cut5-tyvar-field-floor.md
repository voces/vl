# Step 7 codecs, cut 5: a type parameter's field is no longer coded from its spelling, 2026-11-12

This is the first cut 5 change of `2026-11-11-step7-codec-field-rep-column-design.md` (#7250). It
removes the first of the spelling ladder's three floors: the type parameter.

## Census

A scratch probe compiler, never refreshed into a seed, tagged every reach of `nameFieldCodeTy`
whose field type holds a `TyVar`, over 24,067 programs:

- 81 programs reach the floor, where `fieldCodeOfTyCovered` declines.
- 72 more reach a `TyVar`-holding type the descriptor still codes.
- None has a live instance key (`elabWalkTop()` is -1 at every reach). So substituting the field
  type at the intern (`elabSubstClosed`, w321's suggestion) has nothing to substitute with.

These rows are interned from the generic original. Each instance mints its own rows from its
substituted types (D15042's `{f: f64}` arm is one).

## What changed

`nameFieldCodeTy` (`emit_shape_intern.vl`) returns -1 for a `TyVar`-holding type the descriptor
declines, instead of asking the spelling ladder.

## Measurement

A scratch `sweep.vl diff` against the same tree's own fixpoint seed, over 24,067 programs:

- 24,064 same;
- 3 bytes-only movers;
- 0 output movers;
- 0 `runs → not-runs`;
- 0 new compiler traps.

The bytes-only movers are D14726, `generics/error-param-shadow-tyaram-nullable-elem` and
`generics/type-param-shadows-alias-through-constructors`. `wasm-dis` shows each one losing one
struct type, the generic original's duplicate of a row (`(struct (field (mut (ref $5))))` twice
before). The other types are only renumbered. The PR carries the `sweep` label, and CI's diff is
the record.

## What is left

The spelling ladder still answers two floors:

- B171's nullable-element lists, floored by design;
- literal-member unions, which wait on w316's no-row class.

The class G records of w324's census (#7513) are reconciled separately with w324's type-only walk.
