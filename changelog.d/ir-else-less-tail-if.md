## Codegen, memory & runtime (Track B)

- IR: an else-less tail `if` (a returned `if` with no `else`, or a chain ending in one) builds on the
  IR, writing no `else` and leaving its fall-through to the caller's `null` pad.
