# IR: an `if` chain walked along its spine (I8 prerequisite)

ir-design §10 required that, before legacy's statement lowering deletes, the IR's passes loop along
`siElse` and the if-expression spine, that `IR_NEST_MAX` be deleted, and that `ir_build.vl`'s
`walk-limit` count return to 0. D1990 gave legacy's walkers the same shape.

## What loops

| pass | before | after |
| --- | --- | --- |
| builder, statement chain (`ir_build.vl`) | `chainLink` → `stmtIn` per `else if` | `ifChain`: links' tests and `then` arms in order, then the final `else`, then each link's `SIf` innermost first |
| builder, value `if` (`ifExpr`) | `ifArm` → `deliver` → `irBExpr` → `ifExpr` per link | a link whose `else` value is itself an `IfStmt` is the next link; the widen, the out's assign and the `SIf` are written innermost first |
| verifier (`ir_verify.vl`) | `nested(siElse)` | `ifSpine`: one frame per open `else`; a link's arms' writes are checked when its frame ends |
| bounds rule (`ir_verify_bounds.vl`) | `bodyRule` ↔ `innerRule` | one stack of (body, position); a node's bodies are pushed in reverse |
| `irBodyLeaves` (`ir.vl`) | recursed into both arms | recurses into `then`, follows `else` |
| lowering (`ir_lower.vl`) | `ifNode`/`valuedIf` → `body(siElse)` | `body` keeps a frame per open `else`; `ifOpen` writes an `if` up to its `else`, and `ifClose` ends it when that frame does |

Each loop keeps the recursion's order: nodes and variables are allocated in the same sequence, the
first verifier failure is the same, and the lowering writes the same bytes, misses included.
`IR_NEST_MAX` and `ibDepth` are deleted; the dump printer (`ir.vl`'s `bodyText`) still recurses.

## Reach

Value `match` and value `else if` chains do not reach the IR at any length (`tail if switch`,
`expression if`), so the value spine that moves is the nested `else { if … }` form.

| witness | master | this change |
| --- | --- | --- |
| statement `else if` chain, 5,000 links | `nesting depth` (legacy) | claimed; guest fuel 1,274,983,234 → 1,112,947,143 |
| statement `else if` chain, 30,000 links | `nesting depth` (legacy) | claimed |
| nested value `if`, 300 and 5,000 links | `nesting depth` (legacy) | claimed; 5,000 links: fuel 113,527,281,776 → 109,382,346,298 |
| nested value `if`, 30,000 links | over 300 s | over 300 s (outside the IR) |

## Cost

| reading | master | this change |
| --- | --- | --- |
| L2 self-compile fuel, each tree compiling itself | 98,651,427,549 | 98,843,686,740 (+0.19%) |
| the two seeds compiling the master tree | 98,651,427,549 | 98,791,954,569 (+0.14%) |

So about 0.05% is the larger source and 0.14% is the walks' frame arrays. The profile cannot
split that by function at 30k samples; `__grow_0__` is the largest riser. Two cuts measured
nothing: module-level frame stacks in `body` (+23M) and a one-link fast path in `ifChain` (−5M).
The bounds rule pushes a node's bodies without building a list (−5M).
