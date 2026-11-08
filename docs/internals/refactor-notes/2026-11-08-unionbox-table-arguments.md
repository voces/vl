# Union boxing joins the `lowerCoerce` table (2026-11-08)

Step 5's first union-box collapse, per `2026-11-07-lowercoerce-scope.md`. Shadow measured at master
`d1a2c321` (fixpoint seed 6,490,499 bytes).

## The shadow over the population

`scripts/box-dst-shadow/run.sh` runs the shadow, each box call tagged with its position, over
`sweep.vl list` (23,613 programs) in about a minute: 111,374 deliveries, 56,702 top-level:

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

**Disagreements** (87) are order or alias spellings the shadow's key does not equate (`i64|i32` /
`i32|i64` in `D9561`, `Shape` / `{r:i32}|{s:i32}` in `D2697`), or a nullable site union whose
record dropped a member (`d3127_*` named cells). None is at a position this PR changes.

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
- `emitUnionBoxAtRecord`'s record arm is the table, so its seven positions (`emitCallRefArg`,
  index store, push, global assignment, two `??` joins, `getOr` join) are boxed by it. The
  helper keeps its own-union and site arms for a delivery with no usable record.

Site deleted: that record arm's `emitUnionBoxArg`. The direct and captured argument positions are
**parked**, see below.

## The record is order-dependent on a shared instance

Switching `emitDirectArgValue` to the table was byte-identical in the sweep (fresh instance per
chunk order) and failed `cases_wasm_0`: after `closures/hole-fn-labelled-block-left-by-break.vl`
on the same instance, `closures/nul-scalar-list-arm-closure-result.vl` builds invalid wasm. The
checker stamps the argument `useIt(...)`'s node twice more with `mk`'s return union
`(i64 | null)[] | {w: i32}` after its parameter's union (`boxTyStampOne`, last writer wins), and
only when the other program compiled first. Reproduce: `vl check --batch --codegen` of the two
files in that order. Until that recorder leak is found, a position that boxed by its own union
cannot read the record; positions already reading it are unaffected.

## Proof

Fixpoint seed 6,492,492 bytes (+198 against master `756faab3`'s 6,492,294). Sweep against
master's fixpoint: 23,613 same, 0 bytes-only, 0 `runs → not-runs`.

## What is left

- **The recorder leak above**, first: it blocks every position whose site union is replaced.
- **Then positions with no floor in the population**: variant fields (1,093), struct-field store,
  map default, assignment (`emitAssignIdent`), fn-tag dispatch, const-cell init. Each can drop its
  site union for `emitDelivered` outright, one family per PR. Arguments follow with a floor.
- **Returns** (29,604 top-level): 5 floor rows, `D2174` and `D10211`, both generic.
- **Let and global init**: the `i32 | null` floor above, a nullable niche whose record is missing,
  not a box mismatch; to be recorded first.
- **Before narrowed-arm unbox (15) and atom → string (18)**: each needs its record (the scope
  note's step 3); neither has a shadow yet. The seat is the mechanism either reuses.
