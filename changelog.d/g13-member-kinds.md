## Codegen, memory & runtime (Track B)

- **Step 7 (L6):** each union member slice now records which members are literal arms stored at their base scalar, so `msSetCarriesLitUnionArm` can answer from the set for unions such as `K | L | i32 | null` instead of falling back to the union's spelling. Seven answers move in five programs; no output moves.
