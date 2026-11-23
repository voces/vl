## Codegen, memory & runtime (Track B)

- **IR coverage, field place and valued `if`:** a union-field `??` read off a call reads its receiver back from legacy's stash (`coalFieldRecvStash`), and a `string | null` `??` over an if-expression with a literal default builds as the `nulStr` block, the operand inside it.
