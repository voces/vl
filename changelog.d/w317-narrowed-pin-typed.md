## Codegen, memory & runtime (Track B)

- **Step 7 L2, mono: the pin-acceptance test reads the type.** Seven sites, `monoNarrowedPinName` among them, decided whether a spelling could serve as a pin by comparing it with `monoAnnPinName`'s echo of itself. They now ask `monoAnnPinOkTy` of the type directly. All 825 programs that reach them build byte-identical.
