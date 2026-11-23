## Codegen, memory & runtime (Track B)

- **IR coverage, a value `if` boxed arm by arm, an empty list at a union, and a box that only retags:** a value `if` with an `else` written into a union box is built arm by arm at that box, its `else if` links included; an empty list literal into a union takes its adopted list arm's tag; a box whose members owe only a retag is written as itself and rebuilt. Corpus `box ladder` 59 → 55 functions, `union if arm rep` 12 → 0, `union if chain join` 1 → 0; covered = matched.
