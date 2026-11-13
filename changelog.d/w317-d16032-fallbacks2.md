## Codegen, memory & runtime (Track B)

- **Step 7, D16032: the last name fallbacks read the row only.** `unionMemberSetOfRow`, the `??` box's non-null count (`unionRowNonNullCountTy`), `unionArmTysOfRow` and its three twins stop looking a union's name up in `unNames` when the row records nothing; none of those lookups found a row in the population. The twins drop their name parameter. All 4,793 programs that reach these sites build byte-identical.
