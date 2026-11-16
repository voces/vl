## Codegen, memory & runtime (Track B)

- **IR cutover C2i, the atom rep:** a literal-union value may be an IR variable, parameter, result
  or argument, and a string literal delivered as an atom goes through legacy's own literal arm
  (`emitStrLitAt`). The IR covers 1,021 more corpus functions and 114 more self-compile functions,
  every one matched. An atom compare stays a named miss. No emitted byte moves.
