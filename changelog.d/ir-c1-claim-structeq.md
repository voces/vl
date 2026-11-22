## Codegen, memory & runtime (Track B)

- **IR claim: record `==` and `!=` ship.** `RStructEq` moves from the `other` family to `scalar`, beside `RUnionEq`, so a function whose only unclaimed node was a record compare now ships the IR's bytes. `ir-identity.sh --cases` and `--claimless` read 0 differ; 44 tests/cases functions are released, and the IR now claims every function it covers in the distilled corpus.
