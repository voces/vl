# IR coverage: the boxing spread (2026-11-25, lane COV-CLOS)

This is task (c) of the coordinator's 06:48 order: the `array spread boxed` class.

## Mechanism

Legacy takes its boxing arm (`emitArrSpreadBoxed`) when a spread literal's elements must each be
boxed into a union element. That holds at a union-box row its destination threaded
(`spreadBoxDestRow`), or at the literal's own typed row when a source boxes (`spreadBoxingSource`,
`spreadOwnBoxRow`). Each item group is built as itself, then brought to the row. A run, or a linked
literal source, is built at the row directly. A ref list is retagged or widened. A scalar list is
boxed per element. Then the groups are stashed and joined, as in the plain arm.

* **Builder (`spreadBoxedLit`):** builds each group as `emitSpreadGroupBoxed` builds it before its
  tail. A literal source at a build other than the row stays a miss (`array spread boxed literal
  source`). `RSpread.spBoxRow` carries the row, and the verifier checks that each boxing group is a
  list.
* **Lowering (`spreadBoxedList`):** writes each operand, then legacy's tail, which is split out of
  `emitSpreadGroupBoxed` as `spreadBoxedGroupTail`, then the stash and the join.
* **Two ordering facts:**
  * The spread note (`elabSpreadNote`) is taken before the arm is decided, as `emitArrAt` takes
    it. Without it, a linked literal source builds at its own list, and the claimed module fails
    validation.
  * An unminted row pair is minted where legacy's arm asks for it (`SpreadPairNote.sqBoxRow`).

## Census (O1): base (master + #10083) to head, over the 464 programs under tests/cases, distilled and probes that hold a spread

| | base | head |
|---|---:|---:|
| distinct functions claimed | 3,422 | 3,431 |
| start bodies claimed | 350 | 353 |
| `array spread boxed` rows | 20 | 0 |
| claim fallbacks | 0 | 0 |

No function lost its claim. Nine rows moved on to a next miss: `global initializer coercion` 1 → 5,
`array element coercion` 0 → 2, `declaration coercion` 0 → 1 and `push operand coercion` 0 → 1.
Claimless identity (`ir-identity.sh --claimless`) over the same 464 programs plus the sweep: 375
identical, 90 fail under both, differ 0.

## Q58 sweep

`tests/cases/lists/spread-boxed-positions.vl` builds the boxing spread at 12 positions, and every
position prints its value. On head, 6 positions claim: a binding, a union argument, a return, a
record field, a `push` argument, and a closure's body. On base, all 12 missed as `array spread
boxed`. The other 6 now miss on a class of their own:

| position | next miss |
|---|---|
| plain argument, nested argument | `argument coercion` |
| `if` arm | `ref if arm rep` |
| `??` operand | `coalesce nulRef default rep` |
| outer literal element | `array element coercion` |
| index write | `store operand coercion` |

## Parked: a box over a valued `if` (a lowering prerequisite)

Coordinator ruling, 2026-11-25: "box of a valued if" (23 rows) stays open. It needs a lowering that
writes a single-use valued `if` as its box operand after the tag. The builder side was prototyped
(a box lead over the value span). The lowering's stack-order guard in `leaf()` ("operand above a
valued if's value") refuses it, and the prototype dropped 7 claims across 5 functions. The
prerequisite is a live-stack change in `ir_lower.vl` that lets an operand sit above a valued `if`'s
value. The builder side should land only after that. (This note came over from #10083, which was
closed because #10061 had already removed its re-entry.)

## Parked: `for in list union` (coordinator ruling, 2026-11-25)

The class is 4 programs: 3 under tests/cases and the witness of D16897. It is parked behind this
lane's other items. Legacy's `emitListUnionForLoop` writes a tag chain over the union box and
lowers the loop body once per arm, each copy under `knownArmEnter(i)`, beside a flat variant
(`emitListUnionForFlat`). The IR has no such loop shape. Porting it means building the body once per
arm under per-arm builder state, behind a custom loop header.
