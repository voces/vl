# A shared field read over a union box a call returns (2026-11-20)

After #9259 the IR took a shared field read over an un-narrowed box local. The self-compile's
remaining `member box` rows were all call receivers (`g().x`), which legacy's
`emitMemSharedRead` cannot re-emit per arm and so stashes.

## Shape
- **One predicate.** `sharedReadStashes(memIx)` is whether the receiver stashes (anything but an
  ident); `emitMemSharedRead` reads it, and the IR's lowering re-asks it against `srStash`.
- **One slot tail.** `sharedRecvSlotGet(slot)` is the stashed receiver's `local.get` and its
  `ref.as_non_null`, written by legacy's `emitSharedFieldRecv` and the IR alike.
- **IR.** `RSharedRead.srStash`: the receiver is the operand itself (a temp, read once), stashed by
  `local.set` into `sharedFieldRecvSlot()`, asked for where legacy asks, before the receiver. The
  verifier keeps the non-temp rule for an unstashed read only.
- **Invariant.** The slot is one per function (scratch code 7). Between the stash's set and its
  last get, nothing evaluates a user expression: the arms are the plain read and the tail a
  recover. A stashed read inside the receiver (`g(h().y).x`) finishes before the outer set.

## Measured
See the PR body.
