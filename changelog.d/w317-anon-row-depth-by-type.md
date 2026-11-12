## Codegen, memory & runtime (Track B)

- **Step 7 L2, mono: a literal row's list pin takes its depth from the list type.** `monoAnonRowListTy` counted a `#anon` row handle's `[]` suffixes to find the list depth. It now takes the list type from its caller and counts that type's list nesting: the substituted `is` type in `monoSubstIsExpr`, and the pin's open type in `monoSynthPinRef`. The name is read only as the row's handle. Over 24,070 programs the handle route answered in 9 decisions across 7 programs; the type's depth agreed at every one, and all 7 modules are byte-identical.
