# D16052: union `==` intersects its two operands' arms by member type, 2026-11-13

Lane G. `emitUnionUnionEq` built each operand's arm list as atom spellings, using
`msMemberAtomsOfSet` with `unionTyArms` as the fallback. It kept the left arms whose spelling
appeared on the right, then looked each kept arm's type back up by spelling with
`unionArmTyOfAtomTy`.

Each side now reads member types: `msMemberTysOfSet`, falling back to `unionTyMemberTys` of the
read's box type. Two arms match by `memberTySame`, the shared member-identity rule from #7858.
The kept arm's type is the left member type itself. A member is `null` when its type is -1 or the
`null` primitive. `unionArmTyOfAtomTy` has no caller left and is deleted.

## Probe

A probe compiler recomputed the typed lists beside the spelling ones and compared the following
at every `emitUnionUnionEq` that reaches the intersection:

- the list lengths on each side;
- membership, by `tySame` and by `memberTySame`, against the spelling compare;
- the null test;
- each kept arm's type, box kind and tag, against `unionArmTyOfAtomTy`.

Over 24,020 programs, 26 programs reach it, making 71 compares. There were 0 disagreements in
every column.
