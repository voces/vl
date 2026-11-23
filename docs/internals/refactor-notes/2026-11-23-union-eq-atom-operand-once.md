# D17066: a union `==` against a `K | null` operand that is no place (2026-11-23, lane IR-S1)

`emitUnionConcreteEq` refused a `K | null` atom operand that is no place, such as a call. Its
null leg and its decode each re-read the node. Now the operand is read once, as its id, into the
compare's level-keyed i32 slot (`unionEqOperandSlot`). The null leg tests the slot against `-1`,
and the compare decodes the id from the slot with the plan's own tail
(`atomStrTail(atomStrPlanOf(…))`), the bytes `emitAtomToStr` writes after its operand. Where the
operand is left of a staged box it is read first (D17068's order).

The plans the IR shares decline every null leg, as before, so the IR is unaffected.

## Readings

| run | before (D17068's fixpoint) | after |
|---|---|---|
| D17065 grids, 144 programs | 134 run, 10 emit reject | 144 run |
| grid4, 252 programs (D17068) | 252 run | 252 run |
| order probe (`ck() == bx()`, both calls) | emit reject | `kbbkkbbk`, source order |
