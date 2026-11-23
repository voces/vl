# IR: a reference call result at its callee's rep (2026-11-23, lane IR-D1)

Stacked on #9665. The `start: call result coercion` class (35 functions on 9852c3da, 22 programs
blocked by it alone) and its body twin are a call node typed at another rep than its callee's
signature result. A probe at the miss on #9665's head split the start rows: 17 record → record,
4 box → box, 3 map → map, 3 list → list, 1 str → atom, 1 atom → str.

The record rows are the "built wider" soundness family. Mono lays the generic's instance out at
the row its argument is delivered at, so `idn({ r: 4, … })` into `J` returns J's row, while the
call node keeps the literal's own type. Legacy writes the call and stores the returned reference
as it stands: there is no copy, because a copy would be a coercion keyed at the node and would
reach the builder through `coerced`. So when both reps are records, or both lists, maps or boxes,
the IR builds the call at the callee's rep (`sameRefKind`). The atom/str pair stays a named miss.

## Legacy tails the IR calls

None: the lowering is unchanged.

The measurements are in the PR body.
