## Type system (Track A)

- **D16378 closed** (owner ruling Q8): a constant shift count decides an untyped literal
  operand's width. A count of 32 to 63 makes it `i64` (`(-3) >>> (40 + 1)` prints 8388607), a
  count of 64 or more is refused with E6.2's sentence, and a typed operand keeps its refusal.
