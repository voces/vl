## Codegen, memory & runtime (Track B)

- **Step 7 L2, mono, P6: union pins and instance returns are spelled from their types.** `monoPinUnionName` and its `canonEmitName` reparse are deleted, and `monoInstanceRetSpelling` no longer renders through `arenaEmitName` when the type has a spelling. The monomorphizer's union registration now adopts the existing row for a type that already has one, through lane G's type key, so the spelling is only a label. All 3,069 programs that reach either site build byte-identical.
