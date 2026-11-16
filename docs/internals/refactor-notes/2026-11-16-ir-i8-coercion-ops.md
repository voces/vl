# IR I8 design: coercions as ops, the seats retired from the IR's side, 2026-11-16

Lane IR-C. This is a design note, written before any code. The coordinator undeferred I8 after two
steps in a row were capped by a seat. C2l's scalar-width stores sat behind `numSeat` (686 corpus
functions alone), and the boxed nullable discipline sat behind `boxSeat` (195 self-compile, 495
corpus).

## How legacy converts a delivered value

`emitExpr` asks `coerceKindAt(ix)` at its entry, for every node except the one `coerceHeld` names. A
row other than `none` sends the node to `emitCoerced`. The table has two kinds of row.

- **Seat-gated rows** apply only when an outer delivery position has marked `ix` as its seat.
  - `box`: `boxSeat`, set by `emitDelivered`. Its four callers are `emitUnionBoxOwed`,
    `emitUnionBoxAtRecord`, and the two call-argument paths.
  - `unbox`: `armSeat`, set by `armOpen` at a narrowed arm's delivery.
  - `atomstr`: `atomSeat`.
  - `numeric`: `numSeat`, set by `emitNumPlain`, which `emitWidened`'s `plain` arm calls. About 120
    delivery sites call `emitWidened`, `emitExprAsKind` or `emitExprAsElem`.

  The checker records the conversion at the node (`boxRecordTyAt`, `numRecordAt`). The seat only
  says which position may spend that record.
- **Node-keyed rows** apply wherever the node is emitted, with no seat: `listCopy`, `fnClo`,
  `mapUnbox`, `mapRetag` and `recCopy`. `coerceHeld` stops the conversion from re-entering on the
  same node.

In every seat-gated row the seat's whole effect lands on the seated node. Under the seat, legacy
emits the value as built and then one conversion read off the node's record. A node beneath the
seated one sees no seat.

## The model: one IR op per conversion, placed at the delivery

The IR knows its delivery sites, because each one is a builder position. These are: a declaration's
initialiser, an assignment's source, a call argument, a return, a tail value, a global store, a push
value and an element store's value. At each one the builder runs one helper,
`deliver(b, ix, dstRep, site)`:

1. It builds the operand at its own rep, as now.
2. If that rep is the destination's, it is done. This is today's behaviour.
3. Otherwise it asks the same shared plan the legacy position asks for that site, and appends the
   op the plan names, or misses with the plan's name.

The ops, each lowered as *the operand, then legacy's tail*:

| op | replaces | lowering after the operand | shared plan |
|---|---|---|---|
| `RNumWiden { v, dst, at }` | `numSeat` | `numPlainTail(src, dst, at)`: `emitNumPairOp(numRecordAt(at))` where `numFloorWhy` is empty, else `emitNumOpOf(src, dst)` | `widenPlanOf` (C3a) arm `plain` |
| `RBox { v, unionTy, at }` | `boxSeat` | `emitUnionBoxArg`'s tail after its value, which is split out in I8b | `boxOwedAt` + `boxRecordTyAt`, and the position's own seat-or-floor choice (`emitUnionBoxOwed`) |
| `RUnbox { v, heap, at }` | `armSeat` / `armServed` | `emitArmUnboxCast` | `narrowedArmNeedsUnbox` + `armRecordHeapAt` |
| `RAtomStr { v, at }` | `atomSeat` | `emitAtomStrAtRecord`'s tail | `exprIsLitAtom` at a string destination |

`widenPlanOf`'s other arms (`instLit`, `floatLit`, `asgLit`, `radix`) write a constant at the
destination width. The IR builds that constant as an immediate at the destination rep, and the
shadow compares its bits with legacy's. Arm `convert` is a union box, so it waits for `RBox`.

The node-keyed rows need no seat. Today the IR never builds a node that carries one, because the
reps those rows convert between (lists of different elements, maps, closures, records) are not
admitted, or differ, and so miss as a coercion. Each one becomes an op in the same shape when its
rep is admitted, and it is not part of I8.

**What moves to a plan half.** Legacy chooses whether a site seats a node. For example, a call
argument takes `emitDelivered` when the parameter is a box and the record is usable, and
`emitUnionBoxOwed`'s floor otherwise. Each position's choice becomes an exported function that
legacy and the builder both call. `widenPlanOf` already is one, and so is `boxOwedAt`. The rest are
split the way `pushPlanOf` and `idxStorePlanOf` were: one pure decision, then the legacy position
writes its own branch from it.

**What retires.** Under a claim, legacy's position never runs, so no seat is set for the claimed
function's nodes. The IR's op stands in for the seat at the node it would have marked. The seat
variables stay as legacy's own state for unclaimed functions. They are deleted when no legacy
position remains, which is I8's end state in §10.

## Can the IR see every site the checker records?

A record takes effect only where a legacy position spends it. So there are three cases.

- **A position the IR builds** (the eight above, plus a binary operator's mixed-width operand).
  The IR sees it and asks the same plan.
- **A position the IR does not build** (an object or list literal's element, a closure capture, a
  map value, a spread item, a default argument, a valued `if` or `match` arm, the fallback of
  `??`). The function misses at that construct, so the record is never the IR's to spend.
- **A node legacy seats where the IR builds no delivery.** I found one: a binary operator over
  mixed numeric widths, where legacy widens the narrower operand through `emitExprAsKind`. Today the
  IR misses it as `operand coercion`. It is a delivery in the sense above, but its choice of kind is
  the operator's own (`binNumKind`-style), not a destination rep. It gets its own plan in I8a's
  second PR.

The safety net is unchanged. A record the IR fails to spend, or spends twice, changes bytes. The
shadow reports that as a mismatch, and mode 3 as a claim difference, before any claim ships.

## How mode 3 grades it

Each part admits its ops' families into mode 3's throwaway claim. That is `fam != "other"`, with the
op in the family of the site it serves. The part passes when every claimed function in the
self-compile and the corpus is byte-identical and none falls back. This is the bar every C2 step
met.

## Parts, by sole-blocker functions per line

1. **I8a, `numSeat`.** `RNumWiden` at the declaration, assignment, return, tail, element-store and
   push sites. Sized at about 1,075 corpus functions alone, in about 100–140 lines. A second PR
   takes mixed-width operator operands, about 540 corpus functions alone.
2. **I8b, `boxSeat`.** `RBox`, with `emitUnionBoxArg` split around its value. This unlocks the
   boxed nullable discipline, N1. It is sized by the census before building.
3. **I8c, `armSeat` and `atomSeat`.** `RUnbox` and `RAtomStr`. These are sized when they lead the
   census.
