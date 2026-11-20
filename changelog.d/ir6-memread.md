## Codegen, memory & runtime (Track B)

- **IR decision modules 3b-1, the member read's arm:** `emitMem` dispatches on one shared
  decision, `memReadArmOf` (a narrowed box, a bare or nullable variant, or the shared-field
  read), and the IR's struct, variant and narrowed field reads ask that arm instead of
  re-deriving `emitMem`'s receiver tests. No emitted byte moves.
