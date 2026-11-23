## Codegen, memory & runtime (Track B)

- **D17066 closed:** a union `==` against a `K | null` operand that is a call now runs instead of refusing at emit; the id is read once, tested for `null` and decoded from its slot. D17065's grids now run all 144 programs.
