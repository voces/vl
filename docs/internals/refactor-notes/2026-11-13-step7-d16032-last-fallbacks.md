# Step 7 (lane D, D16032): the last name fallbacks read the row only, 2026-11-13

After #7877 a probe of every name fallback over the 24,070-record population found that none
resolved a row its carried row lacked. #7880 retired `msSetOfRowOr`; this retires the rest.

- **`unionMemberSetOfRow`** (emit_union_registry) returns row `u`'s member-set spelling, else
  `name` unchanged. Its name path was `unionMemberSetOf(name)`, which passes an unbound name
  through, and the name was unbound in all 17 programs that took it. The spelling is kept, and
  the label lookup goes.
- **`unionNameNonNullCountTy`** becomes **`unionRowNonNullCountTy(r, ty)`**: the row's members,
  else the type's own set. Its name path found nothing in its 3 programs.
- **`unionArmTysOfRow`**, **`unionHasMapArmOfRow`**, **`unionHasMapArrayArmOfRow`** and
  **`unionClosureArmTyOfRow`** (emit_union_atoms) answer false or -1 where the row records no
  members, and drop their `name` parameter, as do their callers in emit_fn_scans and wasmEmit
  (`cloBoxEqArmTy`). `unionArmTysOfRow` never took its name path in the population.

Lane G agreed the split: `unionArmTys`, `unionArmTysOfTy` and `unionTyArms` stay with G, and
`unionArmTys` loses its row-twin callers here.

## Measurement

| fallback | name path taken | resolved a row by name |
| --- | --- | --- |
| `unionMemberSetOfRow` | 17 programs, 68 decisions | 0 |
| `unionNameNonNullCountTy` | 3 programs | 0 |
| `unionArmTysOfRow` and its twins | 0 | 0 |

**Byte comparison:** master against this change, 4,793 of 4,793 programs build identical. They
are the union of the populations reaching `emitUnionCoerceUnder`, `letNulScalarBoxName`,
`coalesceResultIsBox`, the arm-path scans and the `==` closure arm.

## Proof

- **Seed:** fixpoint (`cmp`).
- **Locally:** lint-self, `scripts/gate.sh`, `mono-tyaram-grid.sh`, the inventory tests.
