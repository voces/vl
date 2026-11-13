## Codegen, memory & runtime (Track B)

- **Step 7, D16032: the ref-array arm scanners read the union type's row.** The four ref-array arm scanners and `unionHasRefArrayArm` take the row the union's type keys, instead of looking its name up in `unNames` through `unionArmMemberTys` (deleted, with its alias-name refusal). All 122 programs that reach the scanners build byte-identical.
