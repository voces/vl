## Codegen, memory & runtime (Track B)

- **IR decision modules 3b-3, the variant coerce's arm:** `emitVariantCoerce` dispatches on one
  shared decision, `variantCoerceArmOf` (a `never` call, a value `if`, an object literal, a bare
  variant, a union box, a cross-tag refusal, else a pass-through), and the IR's narrowed box read
  asks it for `box` instead of restating the arm's union and cross-tag tests. No emitted byte moves.
