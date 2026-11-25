## Codegen, memory & runtime (Track B)

- **The IR builds `s.isCharBoundary(i)`:** a new `charbound` string op lowers through the tail legacy now shares with it (`strIsCharBoundaryTail`), so the call no longer sends its function to legacy. Legacy's bytes are unchanged. Over the distilled corpus, 4 more functions are claimed and matched (46,898 → 46,902 of 46,958).
