## Type system (Track A)

- **A constant-range loop variable passes where a literal union holding its whole range is
  expected (D2065).** `for i in 0 until 4 { s = s + v.lane(i) }` now checks and runs: `i`
  delivers to `Lane4` (`0 | 1 | 2 | 3`) because every value it takes is a lane. The loop-variable
  half of the owner's 2026-09-22 ruling (D-Q2). The ends and step must be integer literals or
  `const`s initialised by one, and the body must never write the variable. `to` and a negative
  step are covered. A data-bounded or empty range, one reaching past the destination's literals,
  and arithmetic over the variable stay `i32` and keep the refusal. The variable's type and rep
  are unchanged everywhere else. The getter half, bounded loops inside a getter, is filed as
  D16065.
