## Codegen, memory & runtime (Track B)

- **IR claims two tail arms legacy writes without a leaving node:** an arm ending in a never-returning call (its lowering already ends in `unreachable`), and an arm ending in a bare block, an else-less tail link whose literal-true test is kept, as legacy's `emitIfTail` writes it. `tail arm` falls 2 → 0: `functions/never-call-ends-path.vl` (`w`) and D1903's witness are fully claimed. Claimed and claims-off builds are byte-identical.
