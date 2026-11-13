## Codegen, memory & runtime (Track B)

- **Step 7 L2, mono: a tagged record's parameter row is answered by type.** `retStructRowIndex` first asks for the row of the type a record holding a tagged set is stored at (`monoTagMapRepTy`). The `#anonN` label rung now answers only where the label's row disagrees with the typed one. That happens in 9 programs, all of which run, and is filed as D16020. Where no type keys the row at all, the rung is a loud floor. No unarmed behaviour change: 249 of 249 programs that reach either rung are byte-identical.
