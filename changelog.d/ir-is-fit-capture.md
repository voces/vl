## Codegen, memory & runtime (Track B)

- **IR coverage: a shadow-arm `is K[]` whose name a closure reads.** The closure's read is its
  own function's, and the region's env capture reads the binding as legacy's does, so the builder
  no longer misses these. No legacy bytes moved.
