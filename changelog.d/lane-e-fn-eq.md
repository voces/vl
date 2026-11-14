## Type system (Track A)

- **`==` on two functions is a check error (D15975, step 3 of 3; DECISIONS A15, 2026-11-14):** `==` is refused when both operands can hold a function (a function or nullable of one, a record field, a list element, a union arm), with advice to use `===` or to narrow; `cb == null` and `u == 5` stay legal.
