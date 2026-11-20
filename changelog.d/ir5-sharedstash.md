## Codegen, memory & runtime (Track B)

- **IR: a shared field read over a union box a call returns.** `g().x` over `A | B` is `RSharedRead` with `srStash`: the receiver evaluated once into legacy's stash slot (`sharedFieldRecvSlot`), each arm's receiver read back out of it (`sharedRecvSlotGet`). `sharedReadStashes` is the one predicate both emitters read for whether the receiver stashes.
