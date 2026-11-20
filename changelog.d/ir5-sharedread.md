## Codegen, memory & runtime (Track B)

- **IR: a shared field read over an un-narrowed union box local.** `u.x` or `u.kind` over `A | B` is `RSharedRead`, lowered on legacy's own dispatch: per member but the last, the box's tag test, then the payload cast and field read, the last member unconditional. `sharedReadPlanOf` is `emitMemSharedRead`'s decision, and `sharedReadPlainOf` the IR's slice of it (an ident receiver, every arm the plain read, no unbox or recover after). `sharedArmTestTail` and `sharedArmPlainTail` are byte tails both emitters write after their own receiver.
