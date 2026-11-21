## Codegen, memory & runtime (Track B)

- **IR coverage, uncalled function values:** the IR builder now builds a function name read as a value that nothing (or only an alias) calls, on legacy's core closure arm. tests/cases +78 and corpus +11 functions, byte-identical.
