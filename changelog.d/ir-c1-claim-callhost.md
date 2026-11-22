## Codegen, memory & runtime (Track B)

- **IR claim: host calls ship.** `RCallHost`, a call of a host import, moves from the `other` family to `call` beside `RCall`, so a function whose only unclaimed node was a host call now ships the IR's bytes. `ir-identity.sh --cases` and `--claimless` read 0 differ; 113 tests/cases functions are released.
