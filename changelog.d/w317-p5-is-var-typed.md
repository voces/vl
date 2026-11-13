## Codegen, memory & runtime (Track B)

- **Step 7 L2, mono, P5: an instance's `is T` records its tested type, not a reparse of its substituted spelling.** `recordClonedIsVarTy` is deleted. The parse was overwritten by the elaboration's own check on all 244 decisions, and all 56 programs that reach it build byte-identical. Where nothing closes the tested type, the compiler now fails loudly instead of parsing a spelling.
