# IR coverage: a union box local narrowed to a smaller union (2026-11-20, lane IR6)

Of the self-compile's `narrowed read` row (2026-11-20-ir-nullable-box-narrow.md), 14 functions
read a union box local narrowed to a smaller union (`if r is RCall { … } else { use(r) }`) at
that union's box rep. Every union box is one wasm box, so legacy's read is the bare `local.get`
on its `local` read arm. `narrowedLocalRead` now holds it as an `RStage` of the local at the new
rep, and `ir_verify` admits an `RStage` whose operand and destination are both boxes. The armed
shadow matches every function it covers.

## Lines

| | lines |
|---|---|
| compiler | +10, −1 |
