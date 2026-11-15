## Infrastructure (Track F)

- **`arena-write-after-lower` ratchet** (medium 6 step 6.3): a lint counts every write into an
  existing node outside the resolve-time lowering (slot writers and node-field stores), 259 in 32
  files, against `scripts/arena-write-budget-baseline.json`, whose count may only fall; the node
  field list is re-derived from `ast.vl` by `tests/vl_arena_write_fields_test.ts`.
