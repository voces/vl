## Codegen, memory & runtime (Track B)

- **IR: closure-call arguments into a union-arm parameter:** a call through a function value whose parameter is one arm of a union now builds in the IR. An argument already of that arm is written as it stands, and one narrowed out of a box is unboxed to the arm, as legacy does. Byte-identical; the corpus's `call of a non-declaration` count falls from 57 to 21.
