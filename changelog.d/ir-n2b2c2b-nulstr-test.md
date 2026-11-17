## Codegen, memory & runtime (Track B)

- **IR N2b-2c-2b, testing and printing a `string | null`:** legacy's null test names each of its
  arms (`nulTestArmOf`), and its nullable-ref arms share one tail. `print` of a `string | null`
  shares its open and tail. The IR builds `== null`, `!= null` and `print` of a `string | null`
  through them. No emitted byte moves.
