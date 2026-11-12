## Type system (Track A)

- **Flow-sensitive reads, the annotated-union face:** a read of a `let` of a union type takes its most recent write's member. `let x: i32 | string = 1; x = "s"; x.length` runs. A join, a loop head, and a capture called after a later write read the storage. Writes are still checked against storage.
- **A test a write made impossible is refused, as D2198 refuses any impossible member:** an `is` that can never match, a `match` arm naming a member the write ruled out, and an `==` of two write-narrowed values that cannot compare. This is the coordinator's ruling, which the owner may overrule. An always-true test runs, and its `else` is typed from storage. Eleven fixtures and witnesses that tested a union `let` right after writing it now take the value from a call, a parameter or a conditional write.
- **A write landing on two union members by assignability now picks the member it is the same variant as:** `{ v: 2 }` into `Box<i32> | Box<f64>` is the `Box<i32>`.
- **D15955 filed:** a refutation pin for an `is` test of a write-narrowed record that also fits the other arm.
