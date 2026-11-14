# `sharedUnionFieldPlan` reads member types, not atoms, 2026-11-14

Lane D, after lane G's g40: this was the last reader of a member set's atom spellings
(`msMemberAtomsOfSet`, the `msFreeAtoms` column) outside G's `msRenderSet` and `msSetIntern`.

`sharedUnionFieldPlan` (emit_classify) used the atoms for three things: their count (a set of
fewer than two members has no shared-field plan), the loop over members, and `atoms[i] == "null"`
to skip a receiver's `null` member when the checker proved it non-null. It already read each
member's type for its arm. The count, the loop and the null test now read the member types
(`msMemberTysOfSet`, `isNullTy`).

## Measurement

A probe in the function, over the 19,741-record population (`tests/cases` and the distilled
corpus), on master `a5f36f6`:

| check | programs (decisions) |
| --- | --- |
| reached | 309 (9,098) |
| member types as many as atoms | 309 (9,098) |
| `null` member exactly where the atom is `null` | 309 (9,098) |
| member types missing where atoms were found | 0 |

**Byte comparison** of master's fixpoint compiler against this change: the 309 reaching programs,
309 SAME; with a 700-program sample of the rest, 992 programs, 864 SAME, 128 refused alike, 0 DIFF.
