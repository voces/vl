## Codegen, memory & runtime (Track B)

- **IR builds the fused `xs.get(i) ?? d` over a scalar list** (`coalesce listGetOr`). Where the receiver and the index are places legacy re-reads (a name, a field path, a literal index), the read is an `SCoalBox` arm on legacy's own head, now shared as `listGetOrOpen`, with the default built into its `else` arm. Byte-identical. A staged operand (a call or an operator) stays a named miss (`coalesce listGetOr staged operand`).
