# START-2: `decided is short-circuit` (2026-11-26)

Regen-10 lists 3 units, all in `unions/hole-is-list-niche-never.vl` (`both`, `either`, `armAnn`).
An un-annotated parameter bound at `string[] | null` is tested `is i32[]`. Legacy decides that test
as a constant (`bareConstIs`) and writes the `&&`/`||` as a valued `if` with the arm the constant
rules out as `unreachable`:
- a false `&&` rules out its right side;
- a true `||` rules out its right side;
- otherwise the fixed answer is ruled out.

`shortCircuit` missed on a decided operand. It now builds the ruled-out arm as the dead-arm node
(`tpWhy`, written `unreachable`, as a value `if`'s decided arm is), and the live arm as before. The
right side is not built when its arm is dead, as legacy does not write it.

`ir-parity`: byte-identical. The case holds `&&` with a decided false, `||` over its negation, and
the annotated parameter.
