## Codegen, memory & runtime (Track B)

- **D17024 closed:** `__trap__` with a literal-union message (`type Why = "empty" | "full"; __trap__(w)`)
  passed `vl check` and emitted an invalid module. The message now prints its member text the way
  `print(atom)` does, then traps. Fixture `traps/trap-atom-message.vl`.
