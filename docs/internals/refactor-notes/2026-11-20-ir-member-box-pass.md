# Perf: a member record read delivered into its field's union passes the box (2026-11-20, lane IR6)

`if z.h is B { show(z.h) }`, with `z.h: A | B` and `show(h: A | B)`: the field tail cast the box's
payload to `B` (`boxedArmOfMember`), and the box plan's `rec` arm boxed it again under `B`'s tag.
One allocation per delivery, off every receiver kind.

## The arm

`holeBoxPlanOf` answers `memberBox`, ahead of `rec`, for a read `boxedArmOfMember` names whose
field's declared union (from the row that read used, `boxedFieldUnionTyOf`) has every record arm
held by the destination and passes into it whole by the fence's own test (`boxPassesAsTy`, factored
out of `holePassPlanOf`). A destination narrower than the field's union stays on `rec`.

The arm's writers read the field at its storage: legacy's `emitHoleBox`, the IR builder
(`memberBoxTemp`) and the IR lowering of that read (`getField`, which re-asks the tail's decisions
when it lowers) each enter `memberBoxReadEnter`, the storage mark plus a seat for that read, and
`boxedArmAtRow` declines only for the seated read. The plain storage mark alone is `emitIs`'s, and
its decisions are unchanged. `memberBoxReadAt` asks `boxedArmOfMember` before the plan, so no other
delivery's plan is asked early (asking it of every delivery moved an unrelated module's rows).

The arm shares the field's box where `rec` built a fresh one. That is unobservable while no writer
mutates a union box in place: no `fbStructSet` in `compiler/*.vl`, and no IR `struct.set` effect,
names `uBoxIdx`.

## Readings

To fill at the merge-base fixpoint.
