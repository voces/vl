## Codegen, memory & runtime (Track B)

- **IR coverage: a negated literal at the negation's width.** In `-2147483647 - 1` the checker types the magnitude `i64` under an `i32` negation. The builder negated an `i64` immediate and missed at `operand coercion`, while legacy writes one constant at the negation's width (`emitSignedNumLitAt`). The builder now does the same for every negated literal, through #9317's `signedLitAt`, its lexeme spelled at that width (`numLitAt`).
