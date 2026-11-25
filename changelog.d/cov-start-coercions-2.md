## Codegen, memory & runtime (Track B)

- IR coverage, coercions (lane COV-START): a nullable hole closure returned at its result's hole rep, and a scalar tail arm boxed at a `T | null` or `T | string` result, are now built by the IR. tests/cases: 17 more functions claimed.
