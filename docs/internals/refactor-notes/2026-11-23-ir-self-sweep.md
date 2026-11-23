# IR-S1: the self-compile builds wholly in the IR (2026-11-23, lane IR-S1)

The self-compile is I8's strictest population. On master 9852c3da it had 36 functions the IR
missed, in 24 classes; at this branch's measured base (cf56aab0), 35 in 24. Every one now builds,
verifies, matches and is claimed. Each function was ablated to a witness (`tests/ir-shadow-rows/`,
one file per shape), and the fixes are grouped by mechanism, one commit each.

## Mechanisms

| class (self fns) | mechanism | legacy answer the IR asks |
|---|---|---|
| map store value unbox (4) | the narrowed-arm unbox gate applies on the `plain` arm only; a union-valued map boxes | `mapSetValArmOf`, `emitMapSetValExpr` |
| object field strAtom (2) | an atom into a string field is delivered (decoded) | `structFieldArmOf`, `emitAtomToStr` |
| narrowed field read coercion (2) | a static atom compare's field side is read raw at its stored atom (`rawFieldRepOf`) | `atomEqPlanOf` `static` |
| narrowed read (2) | a `K \| null` cell narrowed to one member passes its id on a seated read | — (rep only) |
| return coercion (1) | a record twin on its nullable's inner heap is retagged, then widened | `recRowRetag` |
| for in pinned slot (2) | the node-pinned slot where it is the declared one | `declSlotPinned` = `declaredSlotOfDecl` (agreement check) |
| union compare plan (1) | a box that is no place takes legacy's stashed arm | new shared `unionEqStashPlanOf`, `unionEqStashTail`; legacy's `eqOnce` arm now calls them |
| operand type (1) | a scalar map read against an operand: `RMapEq` | `eqRouteOf` `scalarMap`, `scalarMapEqPlanOf`; `scalarMapEqReadTail`, `scalarMapEqTail` split from legacy |
| nullable eq right operand (1) | a call over pure arguments is built once per path | `exprEffectFree` |
| rep unsup (1) | an open-typed `Map()` is built at its destination's map | `mapCtorOf` |
| map iter receiver (2) | a global or field receiver re-read per step (`opndAgain`) | `recvReadsAgain` |
| is box not a local (2) | `rawBoxVar` admits a walk variable, as `irBBoxLocal` does | — |
| index element coercion (2) | a box element at a narrower union's box is `RStage`; an element the box plan passes is its list's box | `holeBoxPlanOf` `pass` |
| push receiver payload cast (2) | `recvReadsListPayload` recurses through a compound receiver | the same per-read check; a narrowed list argument still misses (failing control) |
| push late receiver (1) | a late receiver held in its own local writes nothing either way | `emitPushOne` `lateStage`, `listOpRecvHeldPlan` |
| push short-circuit operand (1) | the receiver is staged below a boxed `??` | `coalBoxFrom` |
| short-circuit field after another (1) | earlier fields are staged as earlier arguments are | `irBStageLeads` |
| short-circuit argument after another (1) | leads staged below an order stash's sets (`stashSetEffect`, `tagStashEffect`'s shape) | — |
| method cpAt (1) | string op `cpat` | `strCpAtTail` split from `emitStrCpAt` |
| member record (1+1) | a variant field off a narrowed box field reads the field's box at its storage | `narrowedFieldPlain` (`memReadArmOf` `narrowed`) |
| code point list spill (1) | read once into the spill slot | `callSpillsFcpArg`; `fcpSpillTail` split |
| expression if ref u8list (1) | the byte list is a reference join | `ifRefJoinOf` |
| pre-path atom hook (1) | a chain link the hook writes as a join is that arm's value; `perArmJoin` built as `litJoin` | `atomHookArmOf`, `emitIfExprAs` |
| coalesce box stash operand (1) | the stash operand set is legacy's (call, `as`, `if`) | `coalStashResidualKind` |
| for in element reflist (1) | a record-list element is read whole | `forInElemPlain` |
| narrowed field unbox rep (1) | a narrowed box field the box plan passes is its record's box | `holeBoxPlanOf` `pass`, `rawFieldRepOf` |

A storage read the IR now asks for (`rawFieldRepOf`, an element at its list's box) is typed at its
storage rep, not the read's narrowing, so the verifier's rule 3 holds.

## Legacy tails the IR calls

- `unionEqStashPlanOf`, `unionEqStashTail` (split from `emitUnionConcreteEq`'s stash arm)
- `scalarMapEqReadTail`, `scalarMapEqTail` (split from `emitScalarMapReadOtherEq`)
- `strCpAtTail` (split from `emitStrCpAt`)
- `fcpSpillTail` (split from `emitCallCoreFromCodePoints`)

Legacy's `emitUnionConcreteEq` refuses (`emitFail`) to reach its re-reading arms with a box that is
no place; a control compiler whose stash plan always declines prints that sentence.

## Measured (fixpoint seeds on both sides, merge-base cf56aab0)

| reading | base | head |
|---|---:|---:|
| self-compile functions, no blocker | 20,197 / 20,232 | 20,249 / 20,249 |
| self-compile classes missed | 24 (35 fns) | 0 |
| self-compile claimed | 20,197 | 20,249 |
| armed self-shadow covered = verified = matched | 20,197 | 20,249 |
| distilled corpus covered (all matched) | 45,405 | 45,410 |
| tests/cases covered / matched | 71,756 / 71,755 | 71,821 / 71,820 |

- Mode 3 self byte-identity: identical; the self-compile reproduces the seed.
- `ir-identity.sh base head --names`: identical 9,037, fail under both 3,267, differ 0; self-compile
  identical.
- `--cases`: identical 7,684, fail under both 68, differ 0; witnesses same 61, differ 0.
- `--claimless`: identical 14,034, fail under both 3,267, differ 0.
- L2 fuel: +0.37% on base's L2 (tier +1%). A first build read +6.14%: the element and field `pass`
  arm asked `holeBoxPlanOf` on every box delivery before its node tests; asked last, it costs this.
- `gate.sh --fast` passed (lint-self, late demands, phase state, ladder sets, dead exports, seed
  size, ir shadow and claims, deno task test).
- `tests/cases/eval-order/union-compare-call-box-once.vl`: base and head print `true true true 3`.

Found on the way and filed, not fixed: D17065 (a union with no `null` arm compared with a
`string | null` operand builds invalid wasm, on base and head alike).
