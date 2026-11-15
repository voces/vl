## Type system (Track A)

- **Spec T3.6: one literal-adoption rule for every join form** (owner ruling 4.3): a numeric literal joined with a typed numeric value adopts its type when it fits (an integer exactly, a float literal at `f32` or `f64`), else keeps its default and joins as a member. The oracle follows it; `scripts/oracle/join-grid.ts` is the 64-cell acceptance grid, which today's compiler meets on 56 cells.
- **Spec T7.4: `.length` is a list's element count, a map's entry count and a set's member count** (owner ruling 4.6). Writing an existing key or adding an existing member leaves it unchanged.
