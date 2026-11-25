## Codegen, memory & runtime (Track B)

- IR coverage, verifier rule 3 (lane COV-IS): a `?? null` (or any `T | null`) over a recursive alias that already holds `null` is held at the alias's own type. Claims that failed the verifier and fell back now hold, including 11 functions across six gate tools (`scripts/lib/census-read.vl` and others).
