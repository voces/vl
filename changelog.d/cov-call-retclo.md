## Codegen, memory & runtime (Track B)

- **IR converts a delivered value through one structural converter, `irConvert` (slice 1):** the return, tail and tail-`if`-arm sites now take a value as it stands or retagged through `irConvert`, a `match` over the destination's rep kind. A returned list, nested list or map of functions whose closure types the result leaves open, or fills, now runs through the IR. A record still retags only by the verifier's field-wise rule. Where no case applies, the miss reads `convert <src> -> <dst>`.
