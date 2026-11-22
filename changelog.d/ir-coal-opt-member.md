## Codegen, memory & runtime (Track B)

- **IR coverage: `p?.f ?? d` over a nullable record's scalar field.** The receiver, its null test, the default and the field read, through legacy's own plan (`coalOptLeafPlanOf`) and tails (`coalOptLeafOpen`, `coalOptLeafRead`); `emitCoalesceOptMember`'s arm (`coalOptArmOf`) and the rung past the boxed arms (`coalNextArmOf`) are stated once and asked by legacy and the IR.
