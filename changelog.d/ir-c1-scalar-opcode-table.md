## Codegen, memory & runtime (Track B)

- **IR cutover C1, the shared scalar opcode table:** every legacy site that chose a binary
  operator's opcode now asks the IR's `lexOpcode`/`primOpcode` table, and the four `binOpcode*`
  ladders and the duplicate `eq` tables are deleted (net −210 compiler lines). The table answered
  76,054 self-compile and 151,394 corpus occurrences with no mismatch, and no emitted byte moves.
