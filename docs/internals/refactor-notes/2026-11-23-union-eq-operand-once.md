# D17068: a union `==` reads an operand with effects once, in source order (2026-11-23, lane IR-S1)

`emitUnionConcreteEq`'s plain and stashed arms read the operand inside the tag-matched `if`, so a
box on another arm skipped it. An operand that is not `exprEffectFree` now takes
`emitUnionEqStaged`: the box and the operand are each read once, in source order, into a slot of
the compare's nesting level (`unionEqOperandSlot`, code 52, key = level × 100000 + rep). Then come
the plan's own tails. The null legs read an operand left of a staged box first, and take
level-keyed slots too.

The plans the IR shares (`unionConcreteEqPlanOf`, `unionEqStashPlanOf`) are unchanged. The IR
claims only an operand it reads in place (`OVar`, `OImm`, `OStr` with no code emitted), so it
never reaches the staged path, and its identity is unaffected.

## Readings

| run | before | after |
|---|---|---|
| grid4, 252 programs: 7 arm kinds × box × side × `==`/`!=` × operand | 84 run, 168 wrong | 252 run |
| null-leg order probe (`sk() == bx()`, `nb() == wx()`) | `bswn` | `sbnw` |
| nested probe (`wrap(sn() == bx()) == bx()`) | trace `b` | `nbwb` |
| D17065 grids, 144 programs | 134 run, 10 D17066 | unchanged |
