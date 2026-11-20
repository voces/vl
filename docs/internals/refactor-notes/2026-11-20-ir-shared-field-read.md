# A shared field read over an un-narrowed union box local (2026-11-20)

The corpus's `member box` blocker was `buildMember`'s fall-through on a union-box receiver. By
receiver, nearly all of it is an un-narrowed box local read at a field every member has (`u.x`,
`u.kind` over `A | B`), which legacy writes as `emitMemSharedRead`'s tag dispatch.

## Shape
- **Decision.** `sharedReadPlanOf` is `emitMemSharedRead`'s plan (`sharedUnionFieldPlan`, then
  `sharedFieldPlanDispatchable`), and `emitMemSharedRead` reads it. `sharedReadPlainOf` is the
  slice the IR takes: an ident receiver (re-read per arm, no stash slot), every arm the plain
  read (`sharedArmIsPlain`: no `null` member, no atom or string conversion, no box), and no
  unbox or recover after the dispatch.
- **Byte tails.** The tag test (`sharedArmTestTail`) and the plain arm (`sharedArmPlainTail`) are
  what follows the receiver; legacy pushes it with `emitSharedFieldRecv`, the IR with its operand.
- **IR.** `RSharedRead { srV, srAt }` over the box local (`irBBoxLocal`); the lowering opens one
  frame per valued `if`. The verifier requires `srV` to be a non-temp box variable, since every
  arm reads it twice.

## Measured
See the PR body.
