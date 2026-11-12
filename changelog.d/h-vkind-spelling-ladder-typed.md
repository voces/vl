## Type system (Track A)

- **Step 7: the field-code ladder reads no spelling without a type.** A field with no arena type has no code. The ladder's list and nullable-list arms answer from the type's rep, so `scalarListRepOfName` and `nulScalarListKind` are deleted. A struct-alias union's row (`type AB = A & B`) takes its field types from the union's one shape. Render-parse parses fall by 4 (36 → 32 on master at #7610).
