## Codegen, memory & runtime (Track B)

- IR coverage, assignment values (lane COV-UNION): an element store's, struct field store's or map set's value used as the assignment's value is the slot its store parked, read back (`RAsgParked`), and a generic function assigned into a closure cell is re-read retagged at the assignment's closure; claimed byte-identical. `assignment value parked` 10 → 0 and `assignment value re-read rep` 9 → 3 on their programs.
