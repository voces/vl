## Codegen, memory & runtime (Track B)

- IR layout family, stage 2b (lane COV-START, coordinator ruling): a struct row whose function field is open only in a set the row stores as a closure counts as built at its rep, as one it stores as the set's id already did; a `let` copy of a record of un-annotated-function records, reassigned and returned, is built by the IR (D17131, D17361, D17362; 7 functions and start bodies newly built in tests/cases, none lost).
