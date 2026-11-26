## Codegen, memory & runtime (Track B)

- **IR claims two more start-body shapes:** a `null`-typed global written as an `if` (run for its effects, then the bottom null, as legacy writes it), and a widened numeric global whose join nests a narrower join (D16496), now widened per arm rather than copying legacy's inner-join adoption. `global initializer nulnone if` 2 → 0 and `global initializer widen join` 2 → 0 on their programs.
