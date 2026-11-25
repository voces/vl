## Codegen, memory & runtime (Track B)

- **IR claims three more start-body shapes:** a `null`-typed global written as an `if` (run for its effects, then the bottom null, as legacy writes it); a widened numeric global whose join nests a narrower join (D16496), now widened per arm rather than copying legacy's inner-join adoption; and nested range loops whose outer loop is unrolled, whose repeated inner copy reuses its slots. `global initializer widen join` 2 → 0, `for range slot` 2 → 0, `global initializer nulnone if` 2 → 0 on their programs.
