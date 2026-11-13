# D16052 close, step 1: `unionTyMemberTys`, a union's member types without its atoms, 2026-11-13

`unionTyArms` (emit_map_twins) returns a union's member atoms and types together. For a row-less
union the atoms come from the free slice's atom column, which D16052 carries as a floor. Ten of
its callers never read the atoms.

`unionTyMemberTys(ty, tys)` returns the member types alone, with the same coverage: the resolved
row's types, else the type's own member set (`msMemberTysOfSet`). The ten callers move onto it
as an exact swap:

| file | functions |
| --- | --- |
| emit_fn_scans | `unionMapArmIdent` |
| emit_map_twins | `unionHasAtomLeafArm` |
| emit_shape_intern | `unionTyHasMemberTy` |
| emit_union_atoms | `unionHasRefArrayArmSlot` |
| emit_mono | `monoTyArmCount` (`atoms.length` becomes `tys.length`; the arrays are index-parallel) |
| wasmEmit | `unionBoxLacksTag`, `emitListEmptyFitArms`, `isPatUnionArmTy`, `mapSoftTwinTagFail`, `mapBoxTagOf` |

The `unionTyArms` callers that do read atoms are the next steps of D16052's close.
