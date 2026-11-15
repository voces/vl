# IR step I1b-1: shared decisions, 2026-11-15

Lane I. This is the first half of step I1b in `ir-design-2026-11.md` §5.3. It applies the review ruling for that step:
every decision the lowering reproduces is a pure function of the node plus an explicit context.
Legacy and the IR each compute that context and both match on the result. Nothing is claimed
yet: claiming is I1b-2. Measured on fixpoint seeds of this branch and of its master base.

## What landed

- **Global storage classes** (`wasmEmit.vl`). These replace I1a's `userGlobalPlain`.
  - `userGlobalReadClass(gi)` returns `"fold" | "promo" | "guard" | "plain"`.
  - `userGlobalWriteClass(gi)` returns `"promo" | "immutable" | "guard" | "plain"`. A write also writes its init bit, `initBitOf(gi)`, which is now exported.
  - `emitUserGlobalGet` and `emitUserGlobalSet` match on these with no `_`, and so does the lowering.
  - The lowering writes `"plain"` and names each other class as a miss.
- **Read recovery.** `globalReadRecovers(isid, readIx, fnIx)` replaces the writer
  `emitGlobalReadRecover`. Both legacy identifier-read sites now append `ref.as_non_null` on it.
  - The builder records the answer at the read as `RGlobalGet.ggNonNull`, and the lowering appends the same byte.
  - Q's `reference global read (non-null)` miss is deleted.
- **Never-returning callees.** `callEndsNever(callIx)` is `callIsNever && !callIsTrapIntrinsic`. `emitCall` asks it.
  - The builder records it as `RCall.caNever`. The lowering then writes `call; unreachable` and never the tail form.
  - Q's two `never-returning callee` misses are deleted.
- **Instance parameter reads** resolve to the parameter variable holding the read's wasm index (`localIndexOf`). Before, they resolved to the template's `Param` node.
  - Q's `instance parameter read` miss is deleted.
- **The void tail callee test** `voidTailCallee(pos)` moved into `wasmEmit.vl`. Both `emitVoidTailCall` and the lowering ask it.
- **A stack-order guard.** An operand written while a valued `if`'s value waits on the stack would
  land above it. Legacy writes `f(a, c && d)` as `a`, then the `if`. Once the reference global read was covered, the I1a lowering wrote the `if` first: a real argument-order defect, which the dual emit caught as a byte mismatch.
  - The lowering now names it: `operand above a valued if's value`.
  - Reproducing legacy's order means writing the valued `if` at its use, as a temp's right-hand side is. That is open work, not this PR.

## Not shared, and why

- The function-end `unreachable` pad, integer negation as `0 - x`, and the literal-true test are
  byte shapes of the lowering, not decisions that read emit state. Each is pinned by the dual emit.
- `initGuardNeeded` still reads the emitter's ambient `gPromoInStart`, `emitCurFnPos` and
  `initGuardOff`. The builder runs inside `emitFuncCode` for a function body, where these hold the
  same values as at legacy's read. Making them explicit is part of the claim step, once a
  claimed function's guard must be written by the lowering.

## Measurements

| reading | master base | this branch |
|---|---|---|
| self-compile, armed: functions | 17,594 | 17,600 |
| covered and verified | 1,827 | 2,125 |
| matched (entry bytes and statement spans) | 1,825 | 2,122 |
| byte or span mismatches | 0 | 0 |
| unlowered, named | 2 (`global read with a guard or a fold`) | 3 (2 `folded global read`, 1 `operand above a valued if's value`) |
| armed self-build byte-identical to the seed | yes | yes |
| unarmed self-compile guest fuel (base compiler, then this branch's before the master merge, same source) | 89,679,406,376 | 89,680,545,432 (+0.0013%) |

Rows are first-miss only, so a deleted miss shows up only where nothing else stopped the function. Each deletion
has a witness in `tests/vl_ir_shadow_test.ts`, which is covered and matched on this branch and
uncovered on the base under the deleted reason. The valued-`if` witness is a byte mismatch on the base and a named
miss here.
