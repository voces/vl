## Codegen, memory & runtime (Track B)

- **D17340 closed: an assignment of one member of a literal-union field or element now runs as a value**, at any position: `print(o.f = "ww")`, `show(ks[0] = "ww")`, `const c = (o.f = "ww")` at module level, a concatenation, an interpolation. Before, it was the emit refusal `an assignment used as a value whose type is not its target's has no value lowering`, except in a function's `let` or `return`. A `"ww"`-annotated binding initialized this way and captured by a closure now validates too.
