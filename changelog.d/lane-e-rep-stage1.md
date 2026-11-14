## Infrastructure (Track F)

- **Rep ADT stage 1, the tree as records:** the rep tree's eight parallel columns become one arena
  of nine `RepNode` record kinds, matched exhaustively and hash-consed through a second
  `Interner` (now a record in `compiler/intern.vl`). Byte-identical; stage 0's 16 `VKind`
  disagreements are triaged, none a miscompile: `docs/internals/refactor-notes/2026-11-14-rep-adt-stage1-arena.md`.
