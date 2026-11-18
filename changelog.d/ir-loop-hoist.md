## Codegen, memory & runtime (Track B)

- **A loop's hoisted list headers read their receivers as the IR read them:** legacy's prologue splits into a shared plan (`loopHoistCands`, `hoistCandRow`) and header tails (`hoistReadTail`), and the IR reads each receiver as its variable, global or plain field read (`irReadVar`, `irReadAgain`) instead of re-entering legacy's expression writer; 13 legacy drivers (591 lines) leave the claim path.
