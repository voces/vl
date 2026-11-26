## Codegen, memory & runtime (Track B)

- **IR: the late box takes every tag-only box over a valued `if` or `??`:** ahead of the head-first arms (`boxTagLateAt`, one `boxTagOnly` test shared by builder and lowering); `boxLeadSpanAt` is deleted. The head-first `boxOfJoinAt` stays for a head that is more than its tag (a niche box's stash slot, a map or closure head). Run output unchanged (behaviour parity).
