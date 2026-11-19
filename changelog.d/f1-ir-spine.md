## Codegen, memory & runtime (Track B)

- **The IR walks an `if` chain along its spine (an I8 prerequisite):** the IR's builder, verifier and lowering loop along an `if`'s `else` and a value `if`'s `else { if … }` spine instead of recursing per link, as legacy's passes do (D1990). The builder's nesting cap (`IR_NEST_MAX`) is deleted, so an `else if` chain 30,000 links long and a nested value `if` 5,000 links deep are now claimed by the IR rather than left to legacy, and `ir_build.vl`'s walk-limit count is 0.
