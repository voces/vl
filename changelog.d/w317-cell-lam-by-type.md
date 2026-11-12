## Codegen, memory & runtime (Track B)

- **Step 7 L2, mono: a capture cell's hole lambda takes a signature when its parameters' types match, not their spellings.** `monoCellLamTakeAt` compared the wanted pin spellings with the lifted lambda's parameter spellings through `normTypeAtom`; it now compares the wanted pin types with each parameter's recorded type (`tySame`, an un-annotated parameter being the all-i32 clone's `i32`). Over 24,070 programs the two agreed at all 256 decisions. `emit_mono.vl` no longer imports `normTypeAtom`.
