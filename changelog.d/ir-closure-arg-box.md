## Codegen, memory & runtime (Track B)

- **IR: closure-call arguments into a union parameter:** a call through a function value whose parameter is a value union now builds in the IR, boxing the argument at that parameter as legacy does. Byte-identical; armed `tests/cases` covers 31 more functions, all matching.
