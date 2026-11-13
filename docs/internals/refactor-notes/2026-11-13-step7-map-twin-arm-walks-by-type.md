# The map-twin arm walks read a union's arms by type or row, never its spelling, 2026-11-13

Lane A, a slice of lane G's `unionSetAtomsOf` split. Emit only.

**The change** (emit_map_twins):
- `unionHasBoolLeafArm` takes the union type, not its name, and reads the arms through
  `unionTyArms`, as its sibling `unionHasAtomLeafArm` does. Its one caller, `refArrBoxTagOf`
  (emit_closure_sites), already held the type, and loses its name parameter.
- `unionSetArmTysAB` loses its spelling parameter. It answers from the row its type keys to,
  else from the type's own member set (`msSetOfTyAny`); the private `unionRowOrSetArmTys` it
  delegated to is folded in.
- `unionRowArmTys` answers from the row's member set (`msSetOfRowOr`) where the row records no
  slice, not by splitting `unMemberSet[u]`.
- Shared helper: `setArmTysInto`.
- `unionSetAtomsOf`, `unionMemberTysOf` and `unMemberSet` are no longer read in emit_map_twins.

**Census** (probe compiler, the full sweep population; which branch answered, old answer
against new):

| reader | sites / programs | answered by |
|---|---|---|
| `unionHasBoolLeafArm` | 9 / 7 | type, all agreeing with the spelling |
| `unionSetArmTysAB` (102, 103) | 47,794 / 7,013 | the row, every time |
| `unionRowArmTys` | 62,562 / 10,131 | the row, every time |

The spelling fallbacks deleted here were never reached in the corpus. The type and set
fallbacks that replace them were never reached either. A miss past them is now a loud floor
(`emitFail`), so a spelling split cannot quietly return.

**Sweep** (master fixpoint seed vs candidate, same tree, with lane H's #7697 merged): 24,203
same, 0 bytes-only movers, 0 output movers, 0 runs → not-runs, 0 new traps.

`markRefArrayArms` and `markMapUnionArms` no longer read their name parameter. It is marked
`_name` rather than removed, since their callers are in emit_collect, where lane G has work in
flight.
