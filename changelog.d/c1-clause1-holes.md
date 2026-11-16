## Codegen, memory & runtime (Track B)

- **D16713 closed:** an un-annotated parameter bound at `string[] | null` and tested `is i32[]` builds a valid module and prints the else arm. A null niche's list now answers false for a list the `is` relation says it never is (as D16370 does for records), and a `&&`/`||` operand that an instance-decided `is` leaves dead lowers as a dead arm. `inferred-generic-list-union-complement.matrix.vl` goes from 2 SILENT cells to 0 and runs 25 of 66 cells, against 0 before; its `@@WANT@@` is now 9.
