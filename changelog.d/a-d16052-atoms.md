## Type system (Track A)

- **Seven union-arm readers test member types, not atoms (step 7, D16052).** `markValueUnionAtoms`, `unionHasMapArmSlot`, `monoPinCanonKind` and `monoNicheNarrowsFrom` read `unionTyMemberTys`; the three `??` joins ask `unionTyHasBoxKind` with the box kind they hold, and `unionTyHasAtom` is gone.
