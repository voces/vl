## Codegen, memory & runtime (Track B)

- **IR claims a loop whose hoisted receiver is a list narrowed out of a union by an early return** (`if b is E { return }` then `while i < b.length`). `scripts/render-parse-census.vl` now matches in full; on the new position sweep, 5 functions that missed now match.
