# Step 7 (lane D, D16032): union equality and the `??` box count read the carried row, 2026-11-13

Three more readers stop looking a union's name up again in `unNames`. Each already held the
row its name came from:

- **`emitUnionConcreteNumCross`** (wasmEmit) picked the number arms a union `==` compares
  across by parsing its atoms (`unionArmsOf` + `valueAtomKind`). It now takes the row that
  `emitUnionConcreteEq` holds from `unionNameRowOfExpr`, and reads each arm's kind off the row's
  member types (`boxAtomKindOfMemberTy`). The atoms answer only where the row records no members.
- **`cloBoxArmTy`** (wasmEmit), the closure-arm fallback of a union `==`, reads through
  `unionClosureArmTyOfRow` (emit_union_atoms) with that same row. Its coerce-list caller still
  passes -1: there the name is the alias-resolved member-set spelling. The type-key row for that
  caller is the behaviour move graded with `unionArmMemberTys`.
- **`unionNameNonNullCountTy`** (emit_union_registry) takes the row `coalesceResultUnionNameRow`
  (#7849) hands to `coalesceResultIsBox`, and counts that row's members where it records them.

## Measurement

MPROBE over the 24,070-record population:

| site | row path, same row as the name | name path |
| --- | --- | --- |
| `unionArmTysOfRow` (now also the `==` closure arm) | 95 programs, 314 decisions | 1 program, no carried row: the old path |
| `emitUnionConcreteNumCross` | 1 program, 2 decisions, same arm kinds in the same order | 0 |
| `unionNameNonNullCountTy` | 626 programs, 3,012 decisions | 3 programs, neither has a row: the type count as before |

**Byte comparison:** master against this change, 710 of 710 programs reaching any of the three
build identical.

## Proof

- **Seed:** fixpoint (`cmp`).
- **Locally:** lint-self, `scripts/gate.sh`, `mono-tyaram-grid.sh`.
