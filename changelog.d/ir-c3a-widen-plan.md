## Codegen, memory & runtime (Track B)

- **IR cutover C3a, the numeric widening plan:** building a value at a wider number kind is one
  pure decision (`widenPlanOf`, a closed `WidenArm`) and one writer (`emitWidened`). These
  replace the three near-duplicate `emitExprAs{I64,F64,F32}` ladders and `emitInstLitAs`. The
  plan agreed with legacy's path at all 866 self-compile and 112,567 corpus widenings, and no
  emitted byte moves.
