## Codegen, memory & runtime (Track B)

- IR coverage, staged `?.` roots (lane COV-UNION): a `?.` whose root is no re-readable place (a call), standalone and under `??`, tees the root into legacy's `?.` stash and reads it back, claimed byte-identical; `optional read staged` 3 → 0 and `coalesce optional staged receiver` 5 → 0 on their programs.
