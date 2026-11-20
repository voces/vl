# IR decision: the boxed-operand coalesce arm, 2026-11-20

Lane F2. Step 1 of the `SCoalBox` plan for `coalesce niche identBox` (`ir-design-2026-11.md` §10),
which IR-REV designed. This step is legacy-only and must leave every module byte-identical. Measured
on fixpoint seeds of this branch and master `c13255ce8`.

## Why this step

`coalesce niche identBox` is a corpus blocker: 128 functions are held by it alone. Before the IR
builds it, the arm has to be one decision that both emitters read. Until now it was a nested ladder
spread over three legacy emitters, `emitCoalesceIdentBox`, `emitCoalesceElemBox` and
`emitCoalesceCallStash`, each deciding and emitting at once.

## What landed

- **The decision.** `coalBoxArmOf(e, lhsIx, exprIx, fnIx): CoalBoxArm`, in `emit_plan_null.vl` beside
  `coalNicheArmOf`. `CoalBoxArm` is a closed set:

  | arm | operand |
  | --- | --- |
  | `boolPop` | a boolean-pop binding |
  | `valBox` | a value-union binding, box result |
  | `valScalar` | a value-union binding, scalar result |
  | `valNoKind` | a value-union binding with an unbanked set |
  | `elem` | a list element |
  | `callBox` | a call, `as?` or `if` operand stashed once, box result |
  | `callScalar` | the same operand, scalar result |
  | `callNoKind` | the same operand with an unbanked set |
  | `next` | none of these: the rest of the ladder |

  `coalKeepsBox` is the one box-or-scalar question for both operand families.
- **Legacy dispatch.** `emitCoalesceIdentBox` is one `_`-less match on the decision. Each arm is its
  own emitter, and each emitter's body is the old branch's, unchanged.
- **Moved, not restated.** Eight predicates the decision reads move from `wasmEmit.vl` to
  `emit_plan_null.vl` unchanged (`setHasNullAtom`, `unionResidualSoloKindOfSet`,
  `coalValUnionResidualKind`, `coalResultBoxName`, `isListElementRead`, `isListGetCall`,
  `nulBoxScalarValtype`, `scalarKindWidens`). The exception is `coalValUnionResidualKind`: it now
  answers -2 for an unbanked declared set instead of recording the failure itself, because a
  decision the IR asks must not fail the compile. The emitter records it at `valNoKind`, with the
  same message.
- **Ladder lint.** `CoalBoxArm` is registered as a closed set; `ladder-sets` matches.

## Measured

- **Fixpoint:** two refreshes are byte-identical.
- **`ir-identity.sh --names` against master's seed:** identical 9,037, fail under both 3,267,
  differ 0, built under one only 0, self-compile identical.
- **`--cases`:** identical 7,516, fail under both 68, differ 0.
- **Budgets:** comment, ladder and sentinel are ok.
- **Compiler lines:** +416 / −340, +76 net. The moved predicates account for about 110 of the lines.
  Each old branch's body moved into its own arm's emitter, and the new lines are the decision, its
  closed set, the dispatch and the lint registration.

## Next

Step 2 is the IR's `SCoalBox` statement node. It is built per arm, its default goes into the null
arm, and it is lowered as a valued `if` through shared head and unbox tails.
