## Codegen, memory & runtime (Track B)

- **IR claim: `__array_new__`, `__array_new_default__` and `__array_copy__` ship.** `RListNew`, `RListNewDefault` and `RListCopy` move from the `other` family to `list`, so a function whose only unclaimed nodes were those intrinsics now ships the IR's bytes. `ir-identity.sh --cases` and `--claimless` read 0 differ; 183 tests/cases functions are released.
