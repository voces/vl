## Codegen, memory & runtime (Track B)

- **IR builds a nullable-reference `??` whose present closure is the result's twin (lane COV-UNION):** `pick(m, "a") ?? dbl`, where the result's closure differs from the operand's only in a part's openness, writes the operand as the result as it stands. The builder and the verifier admit a list twin (`listRetag`) or a closure openness twin (`cloHoleRetag`). Before, the IR refused (`coalesce nulRef result rep`).
