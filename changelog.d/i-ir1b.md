## Codegen, memory & runtime (Track B)

- **IR step I1b-1:** legacy's emitter and the IR lowering now share their decisions as pure functions.
  These cover a module global's storage class, its read's `ref.as_non_null`, a never-returning call's
  `unreachable`, and a void tail call's callee. The IR shadow now covers reference-global reads,
  never-returning callees and generic instances' parameter reads. Nothing is claimed, so no emitted byte moves.
