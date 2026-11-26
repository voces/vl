## Codegen, memory & runtime (Track B)

- **IR claims a range loop whose step is no literal:** the step is read once into the loop's third slot, and legacy's range helpers pick the exit test by its sign. `for range dynamic step` falls 3 → 0; `loops/for-step-expression.vl`, `loops/loop-control-matrix.vl` and `loops/range-edge-step-ends.vl` are fully claimed. Claimed and claims-off builds are byte-identical.
