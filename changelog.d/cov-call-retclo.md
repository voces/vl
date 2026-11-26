## Codegen, memory & runtime (Track B)

- **IR returns a list, nested list or map of functions whose closure types the result leaves open (or fills):** a returned value differing from the result's rep only in closure openness is returned as it stands, retagged (`cloHoleRetag`, both directions). That covers a `return`, a tail expression and a tail `if`'s arms, where only a map or a nullable closure pair was retagged before (`return coercion`, `tail coercion`). A record keeps the verifier's field-wise retag rule.
