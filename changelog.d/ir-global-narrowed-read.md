## Codegen, memory & runtime (Track B)

- **IR coverage, narrowed global reads:** the IR builder now builds a read of a nullable reference global at the member the checker narrowed it to, through one null-narrow decision it shares with local reads. Corpus +38 functions, tests/cases +43 functions and +131 start bodies, byte-identical.
