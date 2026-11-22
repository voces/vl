## Codegen, memory & runtime (Track B)

- **IR coverage: a body-scope type or union declaration writes nothing, and a discarded value legacy evaluates and drops (`stmtIsTailValue`) is built and dropped.** tests/cases `statement` 56 → 0 over the 21 programs that held it.
