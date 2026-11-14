# D16048 + D16049: boxing shared-field members that store the field beside `null` (2026-11-14)

Two neighbours filed while closing D15882: a shared field read whose members store the field
differently, each beside `null`, so the read is typed as a union box (`K | i32 | null`,
`i32[] | string[] | null`). The boxing plan (`sharedFieldArmsBoxable`, then per member
`emitSharedFieldArm`) declined both. A scratch compiler naming the step that declined showed:

| witness | members store | declined at |
| --- | --- | --- |
| D16048 | 30 (set niche), 16 (box) | `sharedReadBoxesSetArm`: the read's soft value-union name drops at `null` |
| D16049 | 18, 31 (nullable lists) | `sharedFieldArmsBoxable`: no nullable list member is boxable |

## Change

- `sharedFieldArmNulSet` admits a member storing a string set at the atom niche;
  `emitSharedFieldNulSetBox` boxes `-1` as the null-tagged box and any other atom as its string.
  `sharedReadBoxesSetArm` accepts a read typed with `null` whose box has a value-union key.
- `sharedFieldArmNulListKind` admits a member storing a nullable list ref, by its list's box tag;
  `emitSharedFieldNulListBox` boxes a null ref as the null-tagged box, any other under that tag.

The nullable-record sibling (both members at code 15, the record box plan with no null test) is a
different mechanism, filed as D16130.

## Measured

Master `1b5ee5499` fixpoint seed against this branch's fixpoint seed:

- 12 templates `matrix/shared-nullable-field-{set-num,set-f64,list-i32-str,list-f64-str}-*.matrix.vl`
  (both member orders, `null` named first), 70 cells each: 840 of 840 run after, 0 before. 0
  `runs -> not-runs`, 0 silent.
- #7976's 14 `shared-nullable-lit-field-*` templates: 72 of 72 before and after.
- D16130 replaces D16049 as the top-level field-access witness in `selfhost_native_diag_pos_test.ts`.
- Sweep, the same two seeds: 24,375 the same, 0 bytes-only movers, 3 output movers (the D16048 and
  D16049 witnesses and the new case, `emit_reject -> runs`), 0 `runs -> not-runs`, 0 new compiler traps.
