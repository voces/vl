# A shared read of a field stored as a record or `null` across a union's members, 2026-11-11

Lane w320, stacked on #7225. Emit only.

**The gap.** `if b { { j: { a: 1 } } } else { { j: null } }` is the union
`{j: {a: i32}} | {j: null}`. A read of `j` is shared over the members, but no shared-field plan
read a field one member stores as a record and another as `null`. The read floored at
`field access receiver is not a struct` (D15717, master too).

**The change.** `sharedFieldNulStructPlan` (emit_obj_lit_fits.vl) answers `FC_STRUCT`, the
record's nullable ref, when every member stores the field as one record row or `null` and the
read is typed as that record or `null` in its frame. The dispatch takes its blocktype from a value
arm (`sharedFieldValueArm`), and a `null` member reads the null ref.

**Graded.** `scripts/capability-probes/matrix/union-of-records-null-record-field.matrix.vl`: with
#7225's seed it ran 0 of 56; now 56 of 56. Fixture: `tests/cases/unions/shared-field-record-or-null-runs.vl`.
D15717 closes. Its repro dropped a declared-record delivery the ablation showed unneeded. That
delivery is its own defect, invalid wasm on master, filed as D15719. The reserved range
D15716-D15719 is released, every id filed.
