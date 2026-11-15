## Type system (Track A)

- **D16318's radix spellings:** a constant count tree beside a radix operand the fold keeps whole
  (`0xFFFFFFFF >> (40 + 1)`, `0xFFFFFFFF >> (32 + 32)` at i64) is refused past the width, as
  E6.2 says, instead of being masked at run time.
