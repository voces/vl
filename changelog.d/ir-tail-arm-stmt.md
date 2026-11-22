## Codegen, memory & runtime (Track B)

- **IR coverage, a tail `if` arm that ends in a statement:** a one-arm block `match` in return
  position, whose desugared dead arm is a `__trap__()` call, builds through the IR. The IR now asks
  legacy's own question for whether an arm's last statement is its value or a statement. No
  emitted byte moves.
