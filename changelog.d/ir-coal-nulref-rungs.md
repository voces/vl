## Codegen, memory & runtime (Track B)

- **IR coverage: a `??` past the nullable-reference core.** Legacy's later rungs are named (`coalNulRefsArmOf`) and legacy dispatches on them; the IR takes a nullable map's core at its map's heap (`coalNulRefsHeapOf`) and builds the null-test rungs as the valued `if` `coalNullTestIf` spells. The remaining rungs are named misses.
