## Codegen, memory & runtime (Track B)

- **IR I8a part 2, mixed-width operator operands:** an arithmetic or comparison operator over
  operands of different numeric widths widens each operand at legacy's width for it
  (`binNumWidth`) through the same `widenPlanOf`/`RNumWiden` path as the deliveries. The IR covers
  877 more corpus functions, every one matched. No emitted byte moves.
