# Step 7 L6 (lane G, #13 P2): two member-kind quirks filed before the typed column, 2026-11-13

#13's P2 replaces the union member slice's banked `valueAtomKind(render)` with a code read off the
member's arena type. A probe at both producers, over the corpus population, found the two disagree
on 201 notes. Most of them are a literal arm the canon render softened (`string` for a literal
union), which an explicit softening rule in the typed code answers. Two families are quirks of the
name parse itself, filed here so the typed column's grade can name them:

- **D16050:** an array of a literal union with more than one base (`9000000000 | 1`, `1 | "a"`)
  banks -1.
- **D16051:** a one-literal array banks -1, 9 or 7 depending on its spelling.

Both run today. The typed column lands in a later PR with a sweep, and moves these codes.
