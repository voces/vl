## Codegen, memory & runtime (Track B)

- **D16606 closed:** a `??` whose number union the destination is no member of (`noneF() ?? 16777217`, an `f32 | i32` join, into an `f64` binding, argument, return or `f64[]` element) now builds its default at the union and converts the whole. Before, the default literal was built at `f64` inside the `f32` box and the module was invalid. The same applies to `i32 | f32 | null ?? 9` into `f64[]`.
