## Codegen, memory & runtime (Track B)

- **D16893 closed (clause 1):** `x as? K[][]` over a box with an `i32[][]` arm no longer returns `null` for an `i32[][]` value whose every leaf is a member. The cast now uses the element test `is` uses.
- **D14041, D14042 closed:** `is K[]` and the `as` trio to `K[]` now run when `K` is a union of `i32` literals. The test reads every element, including on the list's own arm.
