# IR: calls through a bundle record's place or straight off its call, 2026-11-25

Lane COV-CALL, PR C. Base: master 7eddff27, merged with master after #10038. The class is `indirect call`: a callee that is neither a
name nor a field, which `callRefPlainKey`'s expression head refused.

## Change

- **A place holding a returned record whole** (`xs[i](4)`, B2). `emitCallCore` sends it to
  `emitCallRef`, whose `emitHolderCall` reads the member for the call's signature. `callRhs` now
  sends a non-name callee with `holderCallSigs` to `holderCallRhs`, which already covered a named
  holder (`holderRecordOf` builds the place as an expression).
- **A call straight off a returned record's member** (`lap(f)(5)`, `callResultMemberTy`). Legacy
  writes the inner direct call, its member pick (`emitBundleResultPick`), then the plain closure
  call at the member's key. `exprCallRefPlainHead` admits that callee, and only the IR reads it.
  `resultMemberCallRhs` builds the inner call, the `RResultPick` at the member's closure rep, and
  `closureCallAt`.

## Delta on the class's programs (scratch detail census, distinct functions)

| | cases before | cases after | witnesses before | witnesses after |
|---|---:|---:|---:|---:|
| `indirect call` functions | 4 | 1 | 0 | 0 |
| `indirect call` start bodies | 4 | 0 | 2 | 0 |

The one left is `tail:setsplit` (`error-set-in-record-handed-to-hole-param-two-orders.vl`, `app`),
legacy's own refusal (D16747). `bundle-record-called-through-a-map-entry.vl`'s `run` was already
unclaimed on `open local type`.

## Tried and left

- **A top-level lambda returning a bundle record** (`tail:toplambdarecord`, 2 functions, class
  `call of a non-declaration`). The route works: the plain call at the lambda's key, then the
  pick. But every such callee's type is open (its lambda returns a hole function's bundle), so its
  read misses as `open temp type`. It waits on that class.
- **Legacy refusal found by the sweep.** A list element's bundle call in an `if` arm
  (`if c { xs[0](8) } else { 0 }`) is refused by legacy, `if-expression arm ends in a void call`,
  on master's emitter too. It is a legacy defect, so per O3 it gets this line and no row.

## Proof

- Q58 sweep: `tests/cases/closures/bundle-callee-positions.vl`. The call off the result has one
  function per position. The element's positions are at module scope, because a list local to a
  function has an open type. Every position function and the `@init` are claimed after and
  unclaimed before. One function stays unclaimed in another class (`coalesce mapScalarJoin
  default computes`); it runs and is claimless-identical. It builds under `VL_IR_SHADOW=6` with no
  mismatch and is claimless-identical.
- `scripts/ready-check.sh`: `gate.sh --fast: exit 0 (FAST TIER PASSED)`, `ready-check: passed`.
  `ir-identity.sh` runs in CI (ci-ir-identity).
