# IR `__array_new__`: a union fill at its own element union (2026-11-26, lane COV-IS)

- **The miss**: `box into another union` in `std:array`'s `filled` (`__array_new__(n, v)`,
  `std/array.vl:20`) at every instance whose `T` is a union: `i32 | string`, `f32 | null`, a
  numeric join `i32 | f64`, a record union. With no box union recorded at the fill
  (`arrNewFillBoxTy` -1), `arrNew` delivered it with no destination type, and `widenTo` reads an
  unknown type as another union (`boxIntoOtherUnion`). This one std unit is a single `std:array`
  row on regen-9 and blocked 12 programs in INFRA's draft-r9.
- **What landed** (IR only): the fill is delivered at the element rep's own type (`repTyOf`), so a
  fill already boxed at that union passes as is (`holePassPlanOf`'s `pass`); one of another union
  still misses by name. No std body change.
- **Parity**: byte-identical on the sweep, `numerics/coalesce-joins-runtime-numbers-apart.vl` and
  `generics/destination-binds-literal-type-param.vl` (whose start body moves on to `float literal
  at an integer`).
- **Q58 position sweep** (`tests/cases/std/array-filled-union-element-positions.vl`, new): a value
  union, a `T | null`, a numeric join, a record union and the top level. Master: 4 `filled`
  instances `box into another union`; here all 26 functions claimed.
