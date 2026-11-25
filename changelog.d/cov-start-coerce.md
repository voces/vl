## Codegen, memory & runtime (Track B)

- IR coverage, start-body coercions (lane COV-START): the IR now builds, reads and stores a `flat` record's `i8`, `u16` and `i16` fields and reads `i8`, `u16` and `i16` list elements, all of which legacy stores packed. It also boxes a scalar into a field its row holds as a boxed nullable, and hands a list of un-annotated functions to a generic's closure-list parameter.
