## Codegen, memory & runtime (Track B)

- **D16371, D16373 closed:** a value `if` whose arms are constants is built at the width its
  literals take: a parenthesised constant arm is typed with the literal it wraps, and arms that all
  adopt an `i64` or `f64` destination build the join there.
