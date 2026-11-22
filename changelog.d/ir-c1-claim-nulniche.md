## Codegen, memory & runtime (Track B)

- **IR claim: `==` and `!=` over nullable references ship.** `RNulNicheEq`, a compare answering a bool, moves from the `other` family to `scalar`, so a function whose only unclaimed node was such a compare now ships the IR's bytes. `ir-identity.sh --cases` and `--claimless` read 0 differ; 40 tests/cases functions are released.
