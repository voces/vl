## Type system (Track A)

- **D16491, D16492 closed:** a radix tree cast `as f64` computes at 64 bits before it converts (`((-1) - 0xFFFFFFFF) as f64` is `-4294967296`, was `0`). A radix literal beside an operand spelled with an `i64` decimal is zero-extended there (`0xFFFFFFFF & 3000000000` is `3000000000`, was `-1294967296`). The oracle also models a typed `min`/`max`/`abs` over constants and a radix tree beside a typed peer. The 8 radix-width cells from the first fuzz nightly now agree.
