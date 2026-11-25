## Codegen, memory & runtime (Track B)

- IR coverage (lane COV-CLOS): a map read typed at a twin of the map's stored value rep is now built by the IR. The twin differs only in closure openness, for example an un-annotated function stored in an un-annotated `Map()` and read at its pinned signature. The IR reads at the stored value's own `V | null` rep, then retags (`mapGetTwinTy`). The `map get rep` miss falls from 20 rows to 6 over 1,663 map programs; 3 more functions and 6 more start bodies are claimed, none lost, and claimless output is byte-identical.
- Filed D17581: a read of such a map delivered at an annotated function type is refused at emit, though `vl check` accepts it (clause 1, pre-existing).
