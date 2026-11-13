# D16032 (a): `unionArmTysOfTy` reads the row its type keys first, 2026-11-13

`unionArmTysOfTy` (emit_union_atoms) answers a union's arms for a caller that holds the union's
type. Whenever the name was bound to a row, it read that row (`unRowOfName(name)`) and ignored
the type. Now the row the type keys (`unRowOfTyKey`) is read first. A row-less union still reads
its own members (`unionTyArms`), and the name is the last resort. The row's slice copy is pulled
out as `unionRowArmsInto`.

## Decision table (probe over 24,020 corpus and witness files)

Old and new were compared on every call: the success flag, the atoms and the member types.

| | programs | disagreements |
| --- | --- | --- |
| calls to `unionArmTysOfTy` | 91 | 0 |

This is the D16032 half of the site. Its D16052 half, no atoms, follows once lane D's callers
(`unionClosureArmName`, `unionArmTyOfAtomTy`, `cloBoxArmTy`) stop asking for arms by name.
