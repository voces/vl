## Codegen, memory & runtime (Track B)

- IR coverage, union casts (lane COV-UNION): the propagating `as` over a `T | null` niche, a cast to a list across list reps, a box cast to a literal-union arm and a cast over a union of lists stored as one list are claimed byte-identical; the union-cast classes keep 1 row of 32 on the I8 census.
