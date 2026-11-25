## Codegen, memory & runtime (Track B)

- IR coverage, `narrowed read niche kind` (lane COV-IS): a union-box local narrowed to a nullable map, list or closure is claimed as that reference's niche read. Over the programs the class held: tests/cases distinct functions claimed 114 → 143 of 153, witnesses 1 → 3 of 3.
