## Type system (Track A)

- **L2 S3.4a: a hole parameter that only reads its map is pinned by the argument**
  (`refactor-notes/2026-11-16-l2-s3-4a-container.md`; D15161, D16714). The read-only map floor
  refused it when the function came before the call and let it run when it came after. It now runs
  in both orders, and an argument that is no map is refused as `expected a map, got T`. The solver's
  body-order walk (`solveRules`) begins with the array-default bound.
