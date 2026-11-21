## Codegen, memory & runtime (Track B)

- **IR: closure-call arguments that are atoms or scalar lists:** a call through a function value passing a literal-union value or a plain scalar list now builds in the IR, written as it stands as legacy does. Byte-identical; with #9419, armed `tests/cases` covers 86 more functions, all matching.
