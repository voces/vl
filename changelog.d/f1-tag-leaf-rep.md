## Codegen, memory & runtime (Track B)

- **IR: a tag leaf at an open function type:** a generic function used as a value whose node type is still open is built by the IR as its tagged set's member id, at `i32`, as legacy writes it; a destination that is not the set's `i32` still misses at its own rep check.
