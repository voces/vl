## Type system (Track A)

- **D16672 closed:** a bitwise operation over a radix literal whose exact result needs more than 32 bits (`(-1) ^ 0xFFFFFFFF`) is computed at its use's width, as `+`, `-` and `*` over a pattern already were: it prints `0` where it printed `-4294967296` and widened its typed peers (`v2 * ((-1) ^ 0xFFFFFFFF)` printed `-30064771072`), and `const x: i32 = (-1) ^ 0xFFFFFFFF` is accepted. An `i64` destination keeps `-4294967296`.
