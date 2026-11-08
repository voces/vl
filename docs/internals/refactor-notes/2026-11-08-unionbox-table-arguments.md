# Union boxing joins the `lowerCoerce` table: arguments (2026-11-08)

Step 5's first union-box collapse, per `2026-11-07-lowercoerce-scope.md`. Measured at master
`d1a2c321` (fixpoint seed 6,490,499 bytes).

## The shadow over the population

`scripts/box-dst-shadow/run.sh` builds a probe from a copy of `compiler/` (the shadow armed, each
box-helper call tagged with its function and line) and runs it over `sweep.vl list`, 23,613
programs, in about a minute. 111,374 deliveries, 56,702 of them top-level (the rest are a box
helper's own nested call). Top-level, by class:

| class | deliveries |
|---|---|
| agree (incl. up to spelling) | 45,864 |
| value already a box / never returns | 10,257 |
| a record that renders empty | 456 |
| no record | 38 |
| disagree | 87 |

**The floor** (no usable record, 494) is mostly generic code: a `record renders empty` row is a
record that still names a type parameter at an instance that does not close it. 141 are argument
deliveries (`emitDirectArgValue`: 125 empty, e.g. `inventory/D10131`, `D4888`, `D4912`; 16 with no
record, `D4892` and `type-param-coalesce-folded-interpolation-hole`); 182 are an `i32 | null`
global init (`D14432`) and 117 an `i32 | null` let (`D15163`). The other `no record` rows are a
`v128 | null` element (`simd/captured-reassigned-vector-cell`, `D2826`) and `D9564`.

**Disagreements** (87) are all at positions this PR does not touch. Every one is an order or alias
spelling the shadow's canonical key does not equate (`i64|i32` / `i32|i64` in `D9561`, `Shape` /
`{r:i32}|{s:i32}` in `D2697`, `string|i32` / `K|i32` in `capture-walk-variable-box-list-literal`),
or a nullable site union whose record dropped `null` or a member (`d3127_*` named cells,
`emitUnionIfArm`; `nullable-value-map`, `emitMapGetOrUnionBox`). Argument positions: 0.

## Why the box kind is seat-scoped

A first cut made `box` a table kind every `emitExpr` consults. Swept, it lost **548 runs** and
added 204 compiler traps: the `??` lowering, `is` dispatch and every other consumer emit a
recorded operand raw to test it, then box the leaf themselves (`inventory/D1090`:
`src({r: 7}) ?? {r: "s"}` boxed its left operand before the null test, a cast failure). The
checker's record names the union a node is delivered into; it does not say the node's every
emission is that delivery.

So the kind fires only at the **delivery seat**: the node a position hands to
`emitDelivered(ix)`. `coerceKindAt` answers `box` there when the record names a registered union
box (`boxOwedAt`), and the box is the outer conversion: the seat is spent before the value is
built, so a list copy or retag recorded at the same node still runs inside it.

## This PR

- `CoerceKind` gains `box`; `emitCoerced` boxes at the record's union.
- Argument positions read the table: `emitDirectArgValue` and `emitCapturedCall` hand a recorded
  argument to the table and keep the parameter's union only as the floor; `emitCallRefArg` (and
  the six other `emitUnionBoxAtRecord` positions) reach it through that helper, whose record arm
  is now the table.
- 8,081 top-level deliveries are now boxed by the table (`emitCoerced` in the shadow).

Sites deleted: the record arm of `emitUnionBoxAtRecord` (its `emitUnionBoxArg` at the record's
union). The parameter-union `emitUnionBoxArg` at the two direct positions stays, as the floor for
the 141 generic argument deliveries and 16 `no record` ones.

## Proof

Fixpoint seed 6,490,864 bytes (+365). Sweep against master's fixpoint: 23,613 same, 0
bytes-only, 0 `runs → not-runs`.

## What is left

- **Positions with no floor in the population**: variant fields (1,093), struct-field store, map
  default, assignment (`emitAssignIdent`, `emitAssignGlobal`), fn-tag dispatch, const-cell init.
  Each can drop its site union for `emitDelivered` outright; the next PRs, one family each.
- **Returns** (29,604 top-level): 5 floor rows, `D2174` and `D10211`, both generic.
- **Let and global init**: the `i32 | null` floor above, a nullable niche whose record is missing,
  not a box mismatch; to be recorded first.
- **Before narrowed-arm unbox (15) and atom → string (18)**: each needs its record (the scope
  note's step 3); neither has a shadow yet. The seat is the mechanism either reuses.
