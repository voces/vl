## Type system (Track A)

- **D16870 closed (Aeomach AE-001):** a `void` operand of an ordering comparison or a unary operator (`if bump(3) < 0`, `-bump(3)`, `!isOk(1)`), where `bump` is un-annotated and ends in a call, now names `bump` and where its `return` goes, as `==`, arithmetic and a value slot already did, and `vl check --fix` inserts that `return`. The migration guide's first hand-fixed shape is gone.
