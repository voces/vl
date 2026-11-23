## Codegen, memory & runtime (Track B)

- **IR coverage: a map whose value is a rowless record, byte-identical to legacy.** The map's value rep is built at the type of the struct row legacy stores the value in, so a default read (`m[k] ?? {...}`) agrees with the map's own rep. `map read mv value rep` falls from 9 corpus functions to 0. The storage-row-of-type answer is one recorded slot in `emit_rep` (`recordRowFn`, type → row), re-checked with the row-field answers after every row mint, so a row minted later that moves a stored type fails loudly.
