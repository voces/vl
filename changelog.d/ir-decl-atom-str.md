## Codegen, memory & runtime (Track B)

- **IR decodes a literal-union atom narrowed past `null` into a plain string** (`declaration coercion`). A `K | null` narrowed to a member, read where a `string` is wanted, decodes to the member's string as legacy's plan writes it, with no null. The verifier admits it only where the facts pass noted the plan null-free; keyed self-tests pin both sides.
