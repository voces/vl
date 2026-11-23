## Codegen, memory & runtime (Track B)

- **IR coverage:** legacy and the IR decide a `.length` read by one arm, `memberLengthArmOf`, from the program alone. A `.length` that reaches the plain member read past every earlier arm (a record's own field read through a binding narrowed to that record) is now a plain member read in the IR. `member record` 38 → 10 on tests/cases.
