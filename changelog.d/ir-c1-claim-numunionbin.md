## Codegen, memory & runtime (Track B)

- **IR claim: arithmetic over numeric unions ships.** `RNumUnionBin`, a numeric operator, moves from the `other` family to `scalar` beside `RPrimOp`, so a function whose only unclaimed node was such an operator now ships the IR's bytes. `ir-identity.sh --cases` and `--claimless` read 0 differ; 44 tests/cases functions are released.
