## Codegen, memory & runtime (Track B)

- **IR: a union `==` whose box is a field read over a parenthesized receiver, or a global narrowed to a smaller union, builds in the IR**: both are recorded as reads the lowering writes again, as their unparenthesized and local spellings already are. Distilled corpus `union compare box` 1 → 0 (`f64nul_eqlit_list_bind`).
