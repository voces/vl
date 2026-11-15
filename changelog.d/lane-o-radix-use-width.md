## Infrastructure (Track F)

- **The oracle computes a radix tree at its use's width (ruling A):** a width-dependent radix subtree keeps its 64-bit reading for an `i64` use that only becomes known later, a radix `if` arm beside a decimal arm outside `i32` is `i64`, and a shifted constant in `min`/`max` takes a typed argument's width. The 7 arith cells lane N named agree now, including the 2 traps. `known.txt` loses its D2617-class block. A 6,000-cell arith fuzz moves 10 cells, all improvements.
