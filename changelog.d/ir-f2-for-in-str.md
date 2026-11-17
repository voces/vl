## Codegen, memory & runtime (Track B)

- **IR F2, a string's code-point walk:** the plain `for … in` walk now admits a string, which
  legacy walks one code point at a time through the same loop record, open and close as a list.
  The IR passes legacy's string flag and binds an i32 loop variable. The corpus hands 676 more functions to the IR. No emitted byte
  moves.
