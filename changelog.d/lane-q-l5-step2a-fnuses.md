## Codegen, memory & runtime (Track B)

- **The emitter's per-function frame flags are one `fnUses` record** (L5 step 2a): the 24
  `fnUses*` globals become fields built by `fnUsesNone()`, the start builder's four kept fields are
  one named `fnUsesForStart`, and the emitter-state audit reads the record; byte-identical over
  20,173 corpus programs and the L2 build, net −60 compiler lines.
