## Codegen, memory & runtime (Track B)

- **IR converts at the argument, declaration, assignment, global store and field store sites through `irConvert` (slice 2):**
  - Each of these sites now converts through the one converter instead of its own retag chain.
  - The converter gains two cases. A value goes into a niche nullable as its inner value (retagged where it is apart), and a value of no box goes into a box at the destination's union.
  - A cell stores one rep, so a value taken as it stands at another rep goes in by its niche or misses as `convert <src> -> <dst>`.
  - Newly lowered by the IR: a generic function written into a nullable function slot by declaration, assignment or field store; a narrowed record handed to a nullable parameter; a returned `if` joining a filled nullable record with another record.
