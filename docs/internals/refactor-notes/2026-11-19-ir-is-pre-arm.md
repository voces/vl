# IR decision modules 3b-2: an `is` test's rung (2026-11-19, lane IR6)

§10.1(a) stage 3, the second mirror retirement. `emitIs` answered an `is` test by a ladder of
rungs before `emitIsTest`:
- the operand read at its storage;
- a tautology;
- an operand every member of which is tested, as a union or not;
- a non-union operand a primitive or a pin decides.

`isBoxGuardPlain`, which the IR's `is` guard and `isDecidedFalse` read, restated the first three
of them for a union operand.

## The shared rung

`isPreArmOf(isIx, fnIx): IsPreArm` (`storage | tautology | covers | fits | prim | pin | test`) is
the ladder in `emitIs`'s order, in `emit_plan_union.vl`:
- `emitIs` is an exhaustive `match` on it;
- the decided arms share one writer, `isDecidedOperand`: the operand evaluated and dropped where
  it may have effects, then the constant;
- the float against integer literals rung (D3689) goes to `emitIsTest`, so it is part of `test`;
- `isBoxGuardPlain` is `exprUnion(obj) && isPreArmOf(...) == "test"`. For a union operand, only
  `storage`, `covers` and `test` can arise, so this is the old "not at its storage, and not every
  member tested" exactly;
- `isPinOwn` and `isPinUnrelated` move with the decision;
- `IsPreArm` is registered in `lint.vl`'s closed sets.

## Lines

| | lines |
|---|---|
| compiler | +140, −132 |
| `wasmEmit.vl` | −78 (the ladder and its two pin helpers out) |
| `emit_plan_union.vl` | +81 (the decision, the helpers, a two-line guard where nine lines were) |
