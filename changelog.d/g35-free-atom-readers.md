## Codegen, memory & runtime (Track B)

- **D16052 (part):** `unionBoxHasNoRow`, `emitMapGetOrUnionBox` and the union string-`==` scan read a union's member types instead of its member spellings (`msSetHasAtom` → `msSetHasPrimKind`).
