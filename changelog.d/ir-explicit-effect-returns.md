## Codegen, memory & runtime (Track B)

- Compiler source: eight IR lowering and verifier functions whose trailing `match` arms' values
  were discarded now end in an explicit `return 0`, so they no longer fall through to `null`.
