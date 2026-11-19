## Codegen, memory & runtime (Track B)

- **IR, match arm tests typed at the check:** the `match` lowering now records `boolean` on the
  `==` and `||` arm tests it writes after the check, so the IR builder reads their type like any
  other and its private untyped-boolean rule goes. Claims and emitted bytes are unchanged.
