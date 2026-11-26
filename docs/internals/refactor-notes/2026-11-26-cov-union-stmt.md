# One classifier for staged-operand statements (lane COV-UNION, 2026-11-26)

## Why (coordinator ruling, 2026-11-26)

The lowering writes a temp at its one use (`irLOpnd`, `tempRhsWrite`) and checks at each statement
that its operands consumed exactly the temps defined since the previous one, in order
(`irLSettle`). So any node that is not a temp (`SLet`) is a statement written where it stands, and
an operand built before it and used after it must be staged below it (`irBStageLeads`, `RStage`).
That decision was spread over hand lists: `ifBelowLeadHas` tested `SIf`, `SCoalBox`, `SArmSite`,
an `RStashSet` effect and a store; `irBStageLeads` used `valuedIfFrom`, `voidIfFrom`,
`coalBoxFrom`, `stashSetFrom`, `tagStashFrom`, `listStageFrom`, `storeFrom` and
`receiverStageFrom`, each testing node kinds of its own.

## The change

- `stmtClassOf(n)` (`ir_build`): an exhaustive, `_`-less match over `IrNode`. Its classes are
  temp, valued `if` (with `SArmSite`), void `if`, a `??` box that stages or is in place, store,
  order stash, tag stash, receiver stage, effect and control. A new node kind fails to type-check
  until it is classified.
- `stmtLeadsBelow(c)`: the classes `ifBelowLeadHas` stages below, an exhaustive match over the
  classes.
- Every scanner above is now `stmtFrom(b, at, class)`. `storeAt` is gone.
- Exceptions, named as capability debt in the classifier's comment: a void `if` and a receiver
  stage are not yet staged around, and `irBStageLeads` refuses them.

No behaviour change: each class reproduces exactly the node kinds its old list tested. The proof
is the gate's IR shadow byte comparison and CI's `ci-ir-identity`.

## Next (separate PR, measured)

Box-lead spans (`dispatchBoxFrom`, `boxLeadSpanFrom`) are keyed by node identity
(`irBoxLeadBox`), not by kind, so they stay beside the classifier. Widening which classes stage
(bounds checks, drops and the plain effects sit in operand ranges today without staging) changes
bytes and can move boxes from head-first to late (`boxOfJoinAt`, `boxLateAt`), as COV-IS notes.
It goes in its own PR with an `ir-parity` pass over `tests/cases/unions/*-positions.vl`, graded
against the short-circuit and coalesce-optional rows of regen-9.
