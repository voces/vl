## Codegen, memory & runtime (Track B)

- Step 7 L6: a closure result's variant-box union and the inline union registrar's shape test decide from the type, not the spelling; `isVariantBoxUnionOfTy` and the registry's atom-to-type aligners (`unionAtomTysAlignedOf`, `unionAtomTysOf`) are deleted.
