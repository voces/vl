## Codegen, memory & runtime (Track B)

- **IR types a list literal's element retag at the list's element type (fixes master's `ir shadow cases`):** #10322 moved a record's built rep to its storage row, and #10321 let a list of record twins retag. Together they left the element retag typed at `repTyOf` of a row rep, which names another record, so verifier rule 3 failed. The retag is now typed at the literal's element type where that type's rep is the element rep, and is otherwise a named miss.
