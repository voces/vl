## Codegen, memory & runtime (Track B)

- **IR record values carry their struct row:** a record built at a row, read off a field that targets a row, or read from a list laid out at a row is noted at that row (`irVarRow`), at the row's own rep (`rowRep`); field reads lower on that row's heap, and the IR verifier checks the rep and heap agree. A nested struct literal laid out at another row than its field targets is built by the targeted row's layout. `rowTyBuildsAt` no longer reads two sibling fields targeting one row as a cycle. Part one of D17666 (the list place is COV-CALL's).
