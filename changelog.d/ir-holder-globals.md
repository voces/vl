## Codegen, memory & runtime (Track B)

- **IR coverage: the parameters of a clone whose nodes carry no checked type**, mostly mono's baked callback clones (`$cbN`). Each such parameter takes the type of the annotation legacy's valtype reads (`annTyOf(parTyNode(p))`, split out of `annRepKindOf`). This closes the `parameter rep ?` miss.
