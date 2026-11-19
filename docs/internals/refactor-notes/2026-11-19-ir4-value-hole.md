# IR re-entry 1: the value hole retired (2026-11-19, lane IR4)

§10.1 stage 2, first re-entry. Until now, an `RToBox` ran legacy's whole box writer
(`emitUnionBoxArg`) inside an IR-lowered function, with `emitExpr` answering the one node
`irHoleIx` named with the IR's value (I8b). The frame model is in
[2026-11-19-ir-seam-frame-model](2026-11-19-ir-seam-frame-model.md).

## What changed

- **One decision, `holeBoxPlanOf(exprIx, unionTy, fnIx)`** (in `wasmEmit.vl` for now; IR6 moves it
  to `emit_plan_union.vl`). It decides the `T | null` boxes (`RNullable` discipline 4, the only
  box the builder delivers into). It writes nothing, and it asks the ladder's own predicates for
  every rung it skips. Its arms:
  - `null`: a `null` literal, or a null-typed one.
  - `pass`: a box delivered as it stands. No member is re-tagged, re-boxed or rebuilt, and the
    value is no numeric union and no `Map | null`.
  - `atom`: a value-atom box, at `coerceValueAtomKind`'s kind, widened through `widenPlanOf`'s
    `plain` arm.
  - `lit`: the same box over a literal written at the payload width (`instLit`, `floatLit`).
  - `atomStr`: a `K | null` atom boxed as its member string.
  - `ladder`: everything else.
- **Halves.** `holeBoxHead` writes the tag, and for `null` and `lit` the payload too.
  `holeBoxTail` writes the value box and the union box (`atomBoxTail`), or for `atomStr` the
  stash, select and member chain (`atomNulStrTail`). Neither takes a callback.
- **Legacy consumes the plan.** `emitUnionBoxArg` asks `holeBoxPlanOf` first, and where it names
  an arm it writes head, `emitExpr` (or `emitCoerceAtomPayload`) and tail. So legacy and the IR
  agree by construction, and the identity diff below proves the plan reproduces the ladder.
  - `emitUnionCoerceAtomBox` ends in `atomBoxTail`.
  - The `K | null` branch of `emitUnionCoerceValueAtom` became `atomNulStrWhy` (its decision)
    plus `atomNulStrTail`.
  - `emitWidened`'s literal arm became `widenLitAt`.
- **The IR.** The builder's `boxTemp` misses `box <arm>` unless the plan takes its operand:
  - a `null` or a literal leaves its immediate unread;
  - an atom box takes the value at its kind, or at its widening's source kind;
  - `atomStr` takes the atom id;
  - `pass` takes a box.

  `boxOp` writes head, `irLOpnd`, the widening (`numWidenTail`) and tail.
- **Deleted:** `emitBoxAroundHole`, `irHoleIx`, `irHoleUses`, `irHoleWrite`, `holeUnset`,
  `HOLE_STALE` and `irHoleClosed`; `emitExpr`'s hole branch; `emitFuncCode`'s hole check;
  `irLowerHoleWrite`, `lwHoleBox`, and the hook's install in `ir_build_ref.vl`.

## Measured

Fixpoint seeds on both sides, master e1419277f against this branch.

| bar | result |
|---|---|
| `ir-identity.sh` plain | identical 9,034, fail under both 3,267, differ 0; self-compile identical |
| `ir-identity.sh --names` | identical 9,034, differ 0; self-compile identical |
| `ir-identity.sh --cases` | identical 7,504, fail under both 68, differ 0 |
| armed shadow | 30,648 covered = verified = matched (master 30,648) |
| `--claims` | 30,648 emitted by the IR, ok |
| mode 3 self | byte-identical, 0 fell back, 12,646 claimed (master 12,645) |
| pin helpers, `emit_mono.vl` | 905 |
| L2 fuel | L2_FUEL |
| lint-self, phase state, late demands | LINT_ETC |

**Driver census** (`ir-driver-census.sh`, `.reentry`):

| re-entry | master: lines leaving the claim path / drivers / reached | this branch |
|---|---|---|
| `emitBoxAroundHole` | 1,452 / 58 / 8,332 | gone: no re-entry |

Of the 58 drivers the claim path reached only through the hole (1,452 lines):
- 25 (988 lines) no longer run in an IR-lowered function. They are the ladder's writers that call
  `emitExpr` themselves (`emitUnionCoerce*`, `emitUnionArmValueBox`, `emitUnionWideArmBox`,
  `emitUnionBoxNulNiche`, `emitUnionBoxArg`/`Go`, `emitUnionMapArmBox`, `emitWidened`,
  `emitNumPlain`, `emitStashAtomId` and the like), and unclaimed functions keep them.
- 32 (450 lines) are now `@ir`. These are the deciders and writers the plan shares:
  `coerceValueAtomKind`, `coerceListAtomOf`, `unionArmTagClash`, `wideRetagPairs`,
  `boxRetagArmsOfTys`, `emitAtomToStrChain`, the `msHas*` predicates, and byte writers.
- 1 (14 lines, `emitBoxAroundHole`) is deleted.

The remaining re-entries on this branch are unchanged: `mapGetOrHelperRoute` 357 / 11,
`forInLoopOpen` 171 / 6, `strEqTail` 73 / 4, `popDropTail` 38 / 3, `emitStaticLitAtom` 9 / 1.

**Lines.** The compiler grows by 159 lines (+295 / −136). Legacy deletes the hole and its plumbing
(about 70 lines). The plan, its halves and the builder's operand check add about 175. About 60
lines move out of `emitUnionCoerceValueAtom` into `atomNulStrWhy` and `atomNulStrTail`. This step
retires a re-entry and moves the box decision to where both sides call it. It deletes no ladder
rung, because every rung still serves the unions the plan leaves to the ladder and the unclaimed
functions.

Before the plan took the `null` literal below the record rungs, the builder missed 463 functions
as `box ladder`. They were `null` literals that `exprIsNulNone` does not answer for, which legacy
boxes at `emitUnionCoerceUnder`'s literal rung. Before `atomStr`, it missed 21 more as `K | null`
atoms. With both arms, coverage equals master's.
