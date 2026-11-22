## Codegen, memory & runtime (Track B)

- **IR claim: the `raw` family ships.** A function whose only unclaimed nodes were raw ops (a union binding's `if` sink, a list reserve's open and close) now ships the IR's bytes and legacy does not run for it. Both lower through legacy's own writers; `ir-identity.sh --cases` and `--claimless` read 0 differ, and 293 tests/cases functions are released.
