## Codegen, memory & runtime (Track B)

- **IR decision modules 3b-2, an `is` test's rung:** `emitIs` dispatches on one shared decision,
  `isPreArmOf` (the read at storage, a tautology, a covering or decided operand, else
  `emitIsTest`), and the IR's `is` guard asks that rung instead of restating `emitIs`'s first
  three. No emitted byte moves.
