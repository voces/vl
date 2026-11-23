## Codegen, memory & runtime (Track B)

- **IR coverage: the variant row's full chain (`v is B` over record arms whose values cross rows or share one).** It is an `RVariantChain` node lowered over legacy's own tail, `variantRowChainTail` (split out of `emitIsTestVariantRow`, with the same output). Each receiver that tail re-reads goes through a new hook, `fitRecvReadHook`. The IR sets the hook to read its own box variable while it writes the tail, and `irFitTail` restores it on its one exit. A receiver legacy stages into its shared slot stays legacy's.
