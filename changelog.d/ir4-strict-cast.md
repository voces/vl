## Codegen, memory & runtime (Track B)

- **IR door guard, the push receiver's strict cast (ir-design §10.2.1 step 2):** the list payload
  cast takes its `strict` flag as an argument (`listPayloadCastTail`). The door's guard no longer
  misses on it, because no IR module reaches that cast. An import tripwire in
  `tests/vl_ir_door_guard_test.ts` keeps it that way. No emitted byte moves.
