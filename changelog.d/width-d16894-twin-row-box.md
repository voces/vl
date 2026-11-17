## Codegen, memory & runtime (Track B)

- **D16894 closed:** an `i32[][]` value boxed into `K[][] | i32[][] | string` now runs. Before, it was refused whenever the program had already registered `K[][] | string`, a union keyed to the same row. The value rides the arm whose row shares its wrapper, and `is` / `as` read a list of `i32` literals by its leaves at every depth.
