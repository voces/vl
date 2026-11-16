## Codegen, memory & runtime (Track B)

- **IR cutover C2e, list length and the ref list read:** `.length` and the read of a list of
  scalar lists are each one arm that legacy and the IR both call, split around their operands.
  The IR covers 628 more self-compile functions and 344 more corpus functions, every one matched,
  and `list length` drops out of the first-miss histogram. No emitted byte moves.
