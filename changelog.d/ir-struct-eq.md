## Codegen, memory & runtime (Track B)

- **IR coverage, `==`/`!=` over records:** a field-wise record compare whose operands are
  variables, or an operand legacy evaluates once, builds through the IR. It is written by the
  stage, roots and compare tails legacy also writes. No emitted byte moves.
