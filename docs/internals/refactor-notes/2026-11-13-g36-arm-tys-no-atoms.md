# D16052: the union arm-type producers stop appending atoms, 2026-11-13

Lane G. `unionSetArmTysAB` and `unionRowArmTys` (emit_map_twins) appended each arm's atom
spelling beside its member type. For a set with no row, that read `msFreeAtoms` through
`setArmTysInto`. No caller read the atoms:

- `markRefArrayArmsOf` and `markValueUnionArms` take the types alone.
- `markMapUnionArmsOf` used the atom list only as its loop bound, and it tests nothing unless the
  arms are covered. When they are covered, the two lists have the same length.

Both producers now take the member-type list alone. `setArmTysInto` collapses to
`msMemberTysOfSet`, its exact twin, and is deleted. The unresolved-slice branch of
`unionRowArmTys` still answers false, and the atoms it pushed are no longer appended.

This is a refactor with no change in behaviour: every caller either ignored the atoms or acted
only on member types it already had.
