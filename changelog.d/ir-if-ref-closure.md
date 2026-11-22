## Codegen, memory & runtime (Track B)

- **IR coverage: a value `if` joined at a closure (`emitIfExprRef`'s closure kind) writes each arm's closure as itself.** tests/cases `expression if ref closure` 68 → 2 over its 30 programs. About 20 more functions build whole; an arm needing a rep coercion names it (`ref if arm rep`, 15).
