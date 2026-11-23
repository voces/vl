## Codegen, memory & runtime (Track B)

- **IR coverage: `r is {f: L}` on the `recordFit` rung.** A record tested against a narrower record (a literal set or a field box's arms) is an `RRecordFitIs` node lowered over legacy's own `emitRecordFitIs`. Its receiver reads go through `fitRecvReadHook`, as the variant chain's do. A new plan, `recordFitPlanOf`, says when legacy writes the test, refuses it, or stages its receiver; the IR builds only the first, so the builder never calls a writer that refuses.
