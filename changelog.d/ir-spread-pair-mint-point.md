## Codegen, memory & runtime (Track B)

- **IR: a spread literal whose list pair is not yet minted is claimed (`array spread pair unminted`).** Legacy's spread arm asks its list pair (`spreadWrapIdx`) before writing its groups, and a first ask mints it. The builder used to refuse a spread whose pair was unminted when it was built, which is the case at claim time when nothing earlier in the module asked. It now notes the node its groups' writing opens at, and the lowering asks the pair there, in legacy's order. Legacy bytes are unchanged.
