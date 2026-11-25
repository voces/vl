## Codegen, memory & runtime (Track B)

- **D17224, D17463, D17462 closed (refused → runs):** a function with no written result whose `return`s join a record literal with a record built at another row (a maker's call, a local, a lambda's result, a nested field) delivers each returned value to the inferred result, as a written result does, so the built record is made at the join's row instead of being refused at emit.
