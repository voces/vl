## Codegen, memory & runtime (Track B)

- **IR coverage, more field-coalesce receivers and a pinned instance's constant test:** a nullable local narrowed past its null, and a loop variable narrowed to a union arm, are read again on a field `??`'s present path. A union join whose condition a generic instance's pin folds to a constant is written with both arms live, as legacy writes it.
