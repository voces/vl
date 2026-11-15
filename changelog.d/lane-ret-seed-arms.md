## Type system (Track A)

- **D16450 closed:** a value `if` or `match` seeds each arm's lambda with the type it is
  delivered to wherever it stands, returned, bound to an annotated `const`, passed or assigned,
  as a function's tail already did; `seedTailArms` is folded into `seedExpected`.
