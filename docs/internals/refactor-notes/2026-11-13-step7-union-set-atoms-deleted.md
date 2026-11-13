# `unionSetAtomsOf` and `unionSetAtomsOfTy` are deleted: the last union spelling split, 2026-11-13

Lane A, for lane G's `unionSetAtomsOf` retirement; follows #7729. Emit only. It closes the last
render-parse spelling split in lane G's union-registry work.

**What reached the split after #7729** (probe, the full sweep population): 3 sites in 3 programs
(D2823, `unions/readonly-list-member-narrows-and-reads`, `unions/union-eq-non-binding-both-operands`),
all row-less value unions:
- **Two via `unionArmTyOfAtom(name, atom)`**, which passed no type at all. Its one caller is the
  union `==` arm-tag lookup (`unionArmTagOf`).
- **One via `unionMapArmIdent`**, which held the binding's type but asked the name when the type
  keyed no row.

**The change.**
- **Union `==` staged compares.** `emitUnionBoxEqStaged`, `emitUnionBoxEqStagedX`,
  `emitUnionCloTagIn`, `unionArmTagOf` and `emitStructUnionEq` take the union's type, where they
  took its name. Each call site passes the type it already gave `unionBoxEqColumns`. An arm's type is
  read off that union type's own arms (`armTyOfUnionTy`), the arms `unionBoxEqColumns` named, and
  `unionArmTyOfAtom` is deleted.
- **`unionMapArmIdent`.** A row-less binding type answers from its own members; the probe found
  this agrees at 22 / 22 sites.
- **`unionArmTysOfTy`.** A type keying no row reads `unionTyArms(ty)`, never the spelling.
- **`unionArmsOfSetTy`.** A spelling no row binds answers from its type's own member set
  (`msSetOfTyAny`), where it went through `unionSetAtomsOfTy`'s render-and-split. A type-less ask
  is a loud floor.
- **Deleted:** `unionSetAtomsOf`, `unionSetAtomsOfTy` and `unionArmTyOfAtom`, plus the dead
  locals (`vbN`, `unA`, `bxN`) and imports they left.

**The 358 sites the probe said differ** (`unionSetAtomsOfTy`'s atoms against the member set's, 31
programs, out of 3,274 reached) are graded by the sweep. Lane G's 8a and 9a saw the same "spelling
or order differs, set agrees" family move nothing, because consumers key by atom tag or set.
Here they moved 2 programs, bytes only:
- `maps/nullable-list-valued-map` and `maps/module-scope-nullable-list-value-reps`;
- each binary is the same size and identical once type indices are normalised;
- each prints the same output;
- so the change is only the order types are registered in.

**Sweep** (master fixpoint seed vs candidate, same tree): 24,203 same, 2 bytes-only movers (above),
0 output movers, 0 runs → not-runs, 0 new traps.

**Render-parse ratchet**: type-string parses in the emitter 2 → 1. `splitUnionAtoms(set, out)` in
emit_union_registry is gone; the baseline is lowered in this PR.
