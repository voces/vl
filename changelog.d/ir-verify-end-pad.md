## Codegen, memory & runtime (Track B)

- **IR verifier: twelve more legacy queries retired** (D17049; 28 → 16 imports, in 5 verifier functions). Each fact the verifier asked legacy emit for is now recorded on the IR by the builder, which already computed it:
  - rule 5's end pad: `IrFn.irEndPad`, which the lowering reads too;
  - a record's variant row: `RMakeRec.mrVariant`, now set on every record;
  - a saturating truncation's plan: `RTruncSat.tsOp`/`tsFrom`/`tsTo`, which the lowering reads too;
  - whether a box's node is effect-free: `RToBox.bxFree`;
  - memory-access and atomic operand and result prims: `RMemAccess.mmBase`/`mmPrim`, `RAtomic.amBase`/`amValPrims`/`amResPrim`;
  - SIMD operand and result prims: `RSimd.sdMemBase`/`sdPrims`/`sdResPrim`.
