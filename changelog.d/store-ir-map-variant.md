## Codegen, memory & runtime (Track B)

- **IR: an object literal stored into an arm-valued map:** `m[k] = { … }` into a map holding one variant arm builds in the IR at the slot's variant row, on `variantCoerceArmOf`'s `struct` arm, through the object-literal builder at that row (`objLitVariantLayoutAt` and `objLitLayoutRowAt`, which legacy's layout checks delegate to, and `RMakeRec.mrRow`, a struct or variant row). Byte-identical; the distilled corpus claims 345 more functions, and `map store value variant` (694 functions alone) goes to 0.
