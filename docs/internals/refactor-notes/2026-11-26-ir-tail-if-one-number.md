# IR tail `if` typed one wider number (2026-11-26, lane COV-IS)

- **The miss**: `tail if one number`, a returned `if` link whose join is one wider number with a
  literal tail (`retIfIsOneNumber`), and `box ladder` where such a join is an argument. Legacy
  builds the join at that number, each arm widened (`if (result f64)`, `convert_i32_s` on an `i32`
  arm), and boxes it once (`emitReturnExit`, D3656). An outer link keeps its own members.
- **What landed** (the general rule): `ifJoinAdaptsScalar` moves to `emit_value_sites.vl` (no new checker import), and
  `holeBoxPlanOf`'s `if` rung lets such a join fall through to the scalar rungs, which name its
  number's atom, as legacy's ladder reaches them past its `if` rung (`unionCoerceIfArmOf`). The
  tail path delivers the link at the result's union (`floorDeliver`) and returns it.
- **Legacy unchanged**: claims-off bytes identical over `tests/cases/numerics` and
  `tests/cases/unions` (946 programs built), master's claimless compiler against this one.
- **Parity**: `ir-parity.vl --files` reads `same` on `numerics/nested-join-means-its-hoisted-twin.vl`,
  `numerics/nested-scalar-join-returned-into-number-union.vl` and the sweep. The bytes differ in
  order only: the box takes the tag-late path (`boxTagLateAt`), the join held in a local and the
  tag written after it, where legacy writes the tag first.
- **Q58 position sweep** (`tests/cases/numerics/one-number-join-boxed-once-positions.vl`, new): a
  tail return, a nested and a chained link, a `T | null` result, a null outer arm, an argument, a
  binding and an `as` tail. Before: 5 functions `tail if one number`, 1 `box ladder`; here all 9
  are claimed.
