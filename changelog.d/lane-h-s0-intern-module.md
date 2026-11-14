## Infrastructure (Track F)

- **The structural intern table is its own module** (`compiler/intern.vl`, type hash-cons stage
  0): `hcIntern` moved out of `emit_rep.vl` unchanged, so the type arena and the rep ADT can share
  one table. Output byte-identical; the seed is a fixpoint.
