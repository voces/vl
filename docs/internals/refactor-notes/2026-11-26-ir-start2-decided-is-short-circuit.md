# START-2: `decided is short-circuit` (2026-11-26)

Regen-10 lists 3 units, all in `unions/hole-is-list-niche-never.vl` (`both`, `either`, `armAnn`).
An un-annotated parameter bound at `string[] | null` is tested `is i32[]`. Legacy decides that test
as a constant (`bareConstIs`) and writes the `&&`/`||` as a valued `if` with the arm the constant
rules out as `unreachable`. A false `&&` or a true `||` rules out its right side. Otherwise the right
side is live, and the fixed answer stays the plain constant legacy writes there.

`shortCircuit` missed on a decided operand. It now builds a ruled-out right side as the dead-arm
node (`tpWhy`, written `unreachable`, as a value `if`'s decided arm is), and does not build the
right side itself, since legacy does not write it. `tests/ir-shadow-rows/is-decided-guard.vl`,
which pinned this miss, now expects its `shortIs` (`v is i32 && b`, decided true) covered and
matched.

`ir-parity`: byte-identical. The case holds `&&` with a decided false, `||` over its negation, and
the annotated parameter.
