# Step 7 L6: `unionHasAtomKindArm` reads the member set, 2026-11-12

A slice of lane G's `unionSetAtomsOf` split. `unionHasAtomKindArm` (emit_union_casts.vl) asked
whether a union holds an arm of a value-atom kind with no single spelling, such as a list code.
It took the union's name and split it with `unionSetAtomsOf`. It now takes the member set and
reads its atoms with `msMemberAtomsOfSet`, the same shape as #7672's `msSetHasAtom`.

Measured on master `524e1d27`, whose fixpoint seed is 6,716,738 bytes. The population is the
sweep's 24,202 programs.

## The three callers

| caller | the set it hands over |
| --- | --- |
| `spreadSrcBoxAtom` (emit_if_arm_values.vl), from `spreadSrcBoxes` and `emitSpreadGroupBoxed` | the ref-list row's element type (`msSetOfTyAny(rlElemTyIx[row])`); the `un` parameter is gone |
| `coerceValueAtomKind`'s `boolean[]` arm (wasmEmit.vl) | the coerce target's set (`coerceSetOf(uSet, uTy)`); the `unionName` parameter is gone from it and from `emitUnionCoerceAtomBox` |
| `unionEqArmPresent` (wasmEmit.vl) | the box's set `usid`, which it already held; `unmArms` and its `unionMemberSetOfRow` call are gone |

## Probe

A scratch build, never refreshed into `build/`, answered each call both ways and failed loud
when the set's answer differed from the name's, or when the set was uncovered and the name
answered.

- **Control:** a second build failed loud at every call. It fired in 56 programs.
- **Probe:** 0 programs disagreed.

## Proof

- **Sweep**, both sides on fixpoint seeds (base `524e1d27`), 24,202 programs: 24,202 same,
  0 bytes-only movers, 0 output movers, 0 `runs → not-runs`, 0 new compiler traps.
- Fixpoint (two refreshes byte-identical), `lint-self.sh` clean, `regress.vl` no runs lost,
  `check-filed-witnesses --strict` on both inventories 4,863 as filed.
