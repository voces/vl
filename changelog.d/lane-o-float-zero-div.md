## Type system (Track A)

- **`vl check` warns on a float `/` or `%` by a zero literal** (owner ruling 2026-11-15, lane O's spec question 9): `x / 0.0`, `x % -0.0`, `x / (0.0)` report `divide-by-zero` with "dividing by `0.0` gives Infinity or NaN"; a named or computed divisor never warns. `std:math` gains `INFINITY`, `INFINITY_F32`, `NAN` and `NAN_F32` so intentional code has a spelling, and the std-math graders use them.
