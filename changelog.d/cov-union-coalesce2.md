## Codegen, memory & runtime (Track B)

- IR coverage, coalesce batch 2 (lane COV-UNION): a call's `boolean | null` under `??` is the stashed niche cell, a call's box (`callBox`, `callScalar`, `boxStash`) stages an earlier operand's temps below it, and a `never` default at an f64 or i64 widens the call's dead value as legacy does, all claimed byte-identical; `coalesce box next` 5 → 0, `coalesce box after an operand` 4 → 0 and `coalesce never default widened` 3 → 0 on their programs.
