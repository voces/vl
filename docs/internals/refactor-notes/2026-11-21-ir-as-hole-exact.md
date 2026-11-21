# IR: a type-parameter operand's exact numeric cast at its pin, 2026-11-21

Stacked on `2026-11-21-ir-as-exact-opt`. `asCastArmOf`'s `hole*` arms cast an operand whose type
is a type parameter. The cast goes by the instance's pin:
- `holeExact`: `as!` at a pin where the cast can fail;
- `holeOpt`: `as?`, which is `N | null` at every pin (D2754);
- `holeMiss`: a pin that is no number.

Together they were 25 tests/cases functions, every one a named `expression as` miss.

## The change

- **`holeExact`.** `numCastKindOf` and `numCastTail` name the arm at `as!`, from the pinned source
  `asExprHolePinSrc`, which legacy's `emitNumExactCastFrom` already reads. The IR builds it as
  `RNumCast`, as it builds the exact `as!`.
- **`holeOpt`.** Only its failing branch is the exact cast. `holeOptPinTy` and `holeOptExactSrc`
  lift the pin and that branch's source out of `emitHoleNumAsOpt`, which now reads them too, so
  there is one decision. `numCastKindOf` and `numCastTail` name the branch from them.
- **Still named misses.** `holeOpt`'s other branches write no operand (a pin that is no number) or
  box a plain cast, and `holeMiss` drops its operand.
