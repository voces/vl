# Step 7 (lane D, D16032): the ref-array arm scanners read the union type's row, 2026-11-13

`unionArmMemberTys(name)` fed four ref-array arm scanners (`unionRefArrayArmSlotForElem` /
`…ForElemAtom`, `…ForNestedElem`, `…ForMapElem`, `unionNestedArrayArmSlot`) and
`unionHasRefArrayArm`. It looked the union's name up in `unNames`, and refused a name that
`unionMemberSetOf` resolved to something else (an alias name).

Each scanner now takes the union's row and reads `unionMemberTysOfRow`. The wasmEmit callers pass
the row the union type keys (`unRowOfTyKey(unionTy)`); `emitUnionCoerceMapElemList` now receives
its caller's `uTy` for this. `coalesceResultUnionNameRow` (emit_start_block) passes the row it
already holds. `unionArmMemberTys` is deleted.

The alias refusal goes with it. The coerce chain resolves an alias to its member-set spelling
before these scanners run (`emitUnionCoerceUnder`), so an alias's members were already scanned
under that spelling. Reading the type's row gives the same members whichever spelling a caller
held. This is the coordinator's ruling on D16032: a row the type key finds where the label found
none is the fix the row wants, graded runs→runs with output identity under the `sweep` label.

## Measurement

The earlier probe at the coerce chain's typed callers (label row against `unRowOfTyKey(unionTy)`,
24,070 records) found 3,532 programs agreeing, 76 where only the key found a row, 15 numeric
literal unions where they differ (lane G's key fold, task #21), and 12 with neither. A reach
probe on this change finds 122 programs whose compile enters one of the scanners.

**Byte comparison:** master against this change, 122 of 122 programs reaching the scanners build
identical. No output moves in the corpus. The full census runs under the `sweep` label, and the
change is re-graded once the numeric-literal key fold lands.

## Proof

- **Seed:** fixpoint (`cmp`).
- **Locally:** lint-self, `scripts/gate.sh`, `mono-tyaram-grid.sh`.
