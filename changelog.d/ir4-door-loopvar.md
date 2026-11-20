## Codegen, memory & runtime (Track B)

- **IR door, a loop variable inside a list literal:** a list literal that reads a `for` loop's
  variable now lowers at the door. The fragment reads the variable's legacy slot, which is
  checked against legacy's cell. The self-compile's door has no `read of` miss left (36 before).
  No emitted byte moves.
