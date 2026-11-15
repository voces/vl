## Type system (Track A)

- **D16318 closed:** a constant shift-count tree beside a constant operand the fold keeps whole
  (`(-3) >>> (40 + 1)`, `0xFFFFFFFF >> (32 + 32)` at i64) is refused past the width, as E6.2
  says, instead of being masked at run time.
