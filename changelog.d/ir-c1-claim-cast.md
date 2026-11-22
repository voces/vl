## Codegen, memory & runtime (Track B)

- **IR claim: `as!` over a nullable-reference niche ships.** `RCast` (its operand, then `ref.as_non_null`) moves from the `other` family to `box`, so a function whose only unclaimed node was that cast now ships the IR's bytes. `ir-identity.sh --cases` and `--claimless` read 0 differ; 6 tests/cases functions are released.
