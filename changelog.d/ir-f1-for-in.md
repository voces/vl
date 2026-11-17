## Codegen, memory & runtime (Track B)

- **IR F1, the plain `for … in` walk:** legacy's walk takes its loop record, list store and
  loop open and close from shared pieces, and one shared decision (`forInPlainWhy`) names the
  plain walk over an i32 or string list. The IR builds that walk around its own body, and a
  `break` or `continue` of the walk stays a named miss. The self-compile hands 320 more
  functions to the IR. A call whose later argument is an `&&` or `||` is now a named miss, so
  the armed self-build has no mismatch left. No emitted byte moves.
