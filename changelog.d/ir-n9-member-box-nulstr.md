## Codegen, memory & runtime (Track B)

- **IR coverage: a `string | null` shared read over a box whose member's field is `null`.** That arm is the plain read, as legacy writes it, so `sharedArmIsPlain` refuses only the constant null arms (distilled corpus `member box` 6 → 3).
