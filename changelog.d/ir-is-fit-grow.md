## Codegen, memory & runtime (Track B)

- **IR coverage: an `is K[]` whose arm pushes onto its receiver.** The test runs only until the
  arm's grow row holds its `K[]`, the region's pushes land there, and a `.length` of the receiver
  outside the arm reads the grown list once it is filled, as legacy writes each (`listFitGrowOpen`,
  `listFitGrowFill`, `listFitGrowLenOpen`/`Close`). No legacy bytes moved.
