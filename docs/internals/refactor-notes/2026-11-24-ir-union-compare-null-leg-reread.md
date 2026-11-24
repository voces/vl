# IR: a null-leg union compare's field or global operand, read again (2026-11-24, lane N10)

Item (c) of S1's union-compare small lists. A `string | null` (leg 3) or `boolean | null` (leg 2)
operand takes legacy's null leg in `emitUnionConcreteEq`. Legacy reads it twice: once for the
leg's null test, and again in the plain arm through `emitUnionEqOther`. A record field or a global
satisfies `unionEqOperandOk`, so it is not staged, and legacy re-emits the read. The IR built such
an operand as a one-use temp and refused it twice: once at the in-place guard, which admitted
`atUse` only off the null leg, and once at the null leg's "parameter or local" check.

- **Builder** (`unionConcreteEq`): on the null leg, a temp whose read `recvReadsAgain` records (a
  global read, or a field over a variable) passes when the box is read as a variable, and sets
  `ucOtherAgain`.
- **Lowering** (`unionNulEq`): the plain arm's operand read is `opndAgain(r.ucOther, otherIx)`,
  legacy's re-emit, as `boxAgain` is for the box.
- **Verifier**: the null leg's operand check accepts a temp under `ucOtherAgain`.

The box must be a variable because the null leg reads the operand ahead of the box, and the
lowering consumes temps in their definition order. A box held in a temp (a global, as in corpus
`ug_rv3313_g1_sn__b__lit__ret__eq__one` @start) stays `union compare operand`, as on master.

## Legacy tails the IR calls

None new. The null leg's tails are `unionEqNulTestTail`, `unionEqNullTagTail` /
`unionEqNoNullTail`, `unionEqNulElse` and `unionEqNulEndTail` (#9780). The second read goes
through `irHoistRecv`, which writes the global's `global.get` or the field's receiver and
`fieldTail` again, as legacy's `emitExpr` re-emits them.

## Readings (base 84170c68, fixpoint seeds on both sides)

| reading | result |
| --- | --- |
| distilled corpus, mode 4 | `union compare operand` 12 → 0 (`d17065_op_{bool,str}_n_{eq,ne}_{field,global}`, `d17065_op_str_x_{eq,ne}_{field,global}`); no other row moved |
| tests/cases (IR-only census) | `union compare operand` 108 → 0, all the Q58 sweep's own functions; no other row moved; self-compile 0 missed |
| Q58 sweep (`union-eq-null-leg-reread-operand-positions.vl`, `VL_IR_SHADOW=6`) | 108 positions: 9 positions × field and global × `==` and `!=` × three operand kinds (`string \| null` against a box with and without `null`, `boolean \| null`); base 108 miss, head 108 matched; output identical on both seeds |
| `ir-identity.sh <base> <head> --names` | identical 9433, differ 0, built under one only 0; self-compile identical |
| `ir-identity.sh --cases` | identical 7762, fail under both 68, differ 0; witnesses same 61, differ 0 |
| legacy A/B (tests/cases + probes) | 7,830 programs, 0 moved |
| shadow row `union-compare-null-leg-reread-operand.vl` | head 66 covered = matched; base 62, 4 `union compare operand` |

In the sweep, a box `null` against an operand `null` answers on the null leg (`T` where the union
has `null`, `f` where it has not), and a string or bool against itself answers on the plain arm.
The sweep's `for in element nulbool` misses (its own loops over a `(T | null)[]`) are uncovered on
both seeds, in a class this PR does not touch. `callBaseSN` (a field over a call) takes D17068's
staged path, the same on both seeds.

## Left in the class

- A null-leg compare whose box is itself a temp (a global box): the operand read ahead of it would
  break the lowering's temp order.
- (d) `union-closure-arm-equality` @start: dropped. Letting the in-place guard take "only temp
  `let`s built, off the null leg" covers an `a === f0` closure operand, but only moves that start
  on to `operator ==`.
- (d) `union-eq-narrowed-let-operand` @start: FREE, as "global narrowed-let operand at module
  level"; whoever takes it checks with N3.
