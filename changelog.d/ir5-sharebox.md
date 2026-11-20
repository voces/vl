## Codegen, memory & runtime (Track B)

- **IR: a shared field read whose arms box, and every post-dispatch tail but the narrow unbox that writes.** `u.v` over `{v: i32} | {v: string}` is `RSharedRead` with each arm the plain read or its box (`sharedArmIsBox`: a scalar atom or a non-null ref), the tag and box written by `sharedArmBoxHead` / `sharedArmBoxTail`, and the tail after the dispatch by `sharedReadTail` on `sharedReadTailOf`'s one decision; both emitters write them.
