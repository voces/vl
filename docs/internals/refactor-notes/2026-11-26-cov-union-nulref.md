# A nullable-reference `??` whose result rep differs from its present operand (lane COV-UNION, 2026-11-26)

## The refusal

`coalNulRef`'s present arm writes the operand's inner rep (`want`) straight into the result local
at `rep`. Where the two differ the IR refused (`coalesce nulRef result rep`). CENSUS found that
accepting it as-is (`convertAsIs`) passed the builder but failed the verifier. Measured, the class
is two mechanisms.

## The change

- **A closure twin** (`pick(m, "a") ?? dbl`, `closures/generic-helper-over-map-of-hole-fns.vl`):
  the result's closure differs from the operand's only in a part's openness. The builder admits
  the operand as the result as it stands where `listRetag` or `holeRetagNoted` holds, and the
  verifier's `coalNulRefWhy` admits the same twins (`listRetag`, `cloHoleRetag`). Nothing is
  admitted by kind alone.
- **A pinned generic list** (`gt<T>(xs: T[] | null) { return xs ?? [1.5] }` at `f32`,
  `generics/coalesce-type-param-list-default-agrees.vl`): the present inner is `list<f32>` and the
  node's checker type is the default's `list<f64>`. They are stored apart, so no retag is right.
  The `??`'s delivery (`ctxTyAt`, the instance's `T[]`) reps as the operand's inner, and legacy
  keeps the result at that storage, its default built there. So the result is held at the
  operand's inner and the default is delivered at it (the layout ruling: a value's rep follows its
  storage).

## Measured

Each arm runs from its own checkout: master `dcecba046` from a base worktree, and this tree. The
population is tests/cases plus regen-10's COV-UNION programs.
- Without the two new sweeps, exactly the class's two rows move: the closure start and `gt`.
  `coalesce nulRef result rep` 2 → 0. No other row moved.
- Both programs are claimed (`VL_IR_REQUIRE_CLAIM=1` exits 0), and their output equals master's
  under `VL_IR_STRICT=1`.
- `ir-identity.sh --cases`: differ 0, with the same behaviour on all 153 byte-different programs.

Q58 sweeps:
- **`tests/cases/closures/coalesce-nullable-closure-at-open-twin-positions.vl`:** the original
  program's three maps, which ablation shows are all needed (they instance the helper apart), plus
  the `??` in a function and as an argument. Master blocks a function and the start body.
- **`tests/cases/generics/coalesce-pinned-list-result-at-operand-storage-positions.vl`:** returned,
  bound and passed at an `f32` pin, beside an `f64` pin. Master blocks 3 functions.
- On both sweeps this tree has blockers none and matches under `VL_IR_SHADOW=6`.
  `VL_IR_REQUIRE_CLAIM=1` exits 0, and the `@log` lines match under strict.
