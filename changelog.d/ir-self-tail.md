## Codegen, memory & runtime (Track B)

- **IR coverage: a reference join's chain at its head's join.** A string or reference `match`
  or `else if` chain whose inner links' own join differs from the head's (for example, arms of
  string literals) builds through the IR, with every link opened at the head's join as legacy
  writes it.
