# IR decision modules 3b-3: the variant coerce's arm (2026-11-20, lane IR6)

§10.1(a) stage 3, the box narrow. `emitVariantCoerce` delivers an expression to variant `vi` by
a ladder: a `never` call, a value `if`, an object literal, a bare variant passed through, a union
box unboxed (or refused on a cross-tag fit), else a pass-through. `narrowedBoxVariantPlain`, which
the IR's `RBoxNarrow` claim and its lowering read, restated the box rung's tests (not a bare
variant, a union, no cross-tag fit).

## The shared arm

`variantCoerceArmOf(vi, exprIx, fnIx): VariantCoerceArm`
(`none | never | ifValue | struct | bare | box | crossTag | pass`), in `emit_plan_union.vl`:
- `emitVariantCoerce` is an exhaustive `match` on it; `none` is its old `unwrapParen` miss, now
  bound-tested inside the decision; the box arm's writer is `emitVariantBoxUnbox`;
- `narrowedBoxVariantPlain` is the local read's own terms (an `Ident` on the `local` read arm,
  `narrowedStructArmVi`) and `variantCoerceArmOf(vi) == "box"`. For an `Ident`, `never`, `ifValue`
  and `struct` cannot arise, so `box` is exactly the old "not bare, a union, no cross-tag fit";
- `VariantCoerceArm` is registered in `lint.vl`'s closed sets.

## Lines

| | lines |
|---|---|
| compiler | +55, −23 |
| `wasmEmit.vl` | +17, −18 (the ladder out, the match and the box writer in) |
| `emit_plan_union.vl` | +31, −3 (the decision; the restated tests out) |
| `lint.vl` | +7, −2 (the closed set) |
