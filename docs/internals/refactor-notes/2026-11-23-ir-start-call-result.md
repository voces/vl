# IR: a reference call result at its callee's rep (2026-11-23, lane IR-D1)

Stacked on #9665. The `start: call result coercion` class (35 functions on 9852c3da, 22 programs
blocked by it alone) and its body twin are a call node typed at another rep than its callee's
signature result. A probe at the miss on #9665's head split the start rows: 17 record → record,
4 box → box, 3 map → map, 3 list → list, 1 str → atom, 1 atom → str.

The record rows are the "built wider" soundness family. Mono lays the generic's instance out at
the row its argument is delivered at, so `idn({ r: 4, … })` into `J` returns J's row, while the
call node keeps the literal's own type. Legacy writes the call and stores the returned reference
as it stands: there is no copy, because a copy would be a coercion keyed at the node and would
reach the builder through `coerced`. So when both reps are records, or both lists or boxes, the
IR builds the call at the callee's rep (`sameRefKind`). The map pair is left out: no witness
claims a function the map arm would admit (each is held back by a later miss). The atom/str pair
stays a named miss.

## Verifier

No new arm. The call's temp is built at the callee's own result rep, so rule 6's result check
(`dst == sigRet`) holds as it is. Every consumer of the temp is checked against that rep by its
own rule: a global store, a field read or a return.

## Witnesses, each run under both seeds with the same output

- box: `generics/union-member-order-across-pins.vl` (start claimed at head)
- list: `soundness/list-fresh-call-bare-literal-into-record-list.vl` (start claimed)
- record: `soundness/bound-fresh-call-through-identity-delivered-wider-runs.vl` (start claimed)

## Legacy tails the IR calls

None: the lowering is unchanged.

The measurements are in the PR body.
