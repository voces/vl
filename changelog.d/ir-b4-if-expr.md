## Codegen, memory & runtime (Track B)

- **IR B4a, a value `if`:** the IR builds a plain scalar value `if`, one value per arm and no
  `else if`, as a valued `if` whose arms write its out, the shape `&&` and `||` already lower
  through, over the decision legacy's `emitIfExpr` takes (`ifExprPlainKind`). A returned value
  `if`, legacy's tail path, is a named miss for B4b. No emitted byte moves.
