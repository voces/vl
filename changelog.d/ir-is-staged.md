## Codegen, memory & runtime (Track B)

- **IR coverage: an `is` test the checker minted as a content check, and `xs is L[]` on the `listFit` rung.** A test with a minted content check (`isFit`, such as a record tested against a narrower record) is built as that check, as legacy writes it. A list tested against a narrower literal-element list type is an `RListFitIs` node over legacy's own walk. `emitListFitAt` is split into a pure plan (`listFitPlanOf`) and its walk (`listFitTail`), with the same output, so the IR builder never calls a plan that refuses.
