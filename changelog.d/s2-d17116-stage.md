## Codegen, memory & runtime (Track B)

- **D17116 closed:** a union compare whose left operand is a place (a global, field, element or captured local of `K | null`, `string | null` or `boolean | null`) and whose right side is a call that writes that place now reads the place before the call; before, it read it after, so `gk == setG("a", "a")` printed `true`, and a `string | null` field set to `null` by the call trapped.
