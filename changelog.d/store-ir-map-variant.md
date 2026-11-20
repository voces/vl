## Codegen, memory & runtime (Track B)

- **IR: an object literal stored into an arm-valued map:** `m[k] = { … }` into a map holding one variant arm builds in the IR at the slot's variant row, on `variantCoerceArmOf`'s `struct` arm, through the object-literal builder at that row (`objLitVariantLayoutAt`, shared with legacy's layout check, and `RMakeRec.mrRow`). Byte-identical; CLAIMS.
