## Codegen, memory & runtime (Track B)

- **IR claim: `==` and `!=` over function values ship.** `RClosureEq` moves from the `other` family to `scalar`, beside `RUnionEq`, so a function whose only unclaimed node was such a compare now ships the IR's bytes. `ir-identity.sh --cases` and `--claimless` read 0 differ; 18 tests/cases functions are released.
