## Codegen, memory & runtime (Track B)

- **IR: long list literals (`array long`, D17054).** A string list past the 256-element operand cap whose elements are literals builds through legacy's own chunked steps (`arrLitStrChunkOpen/Step/Close`). A numeric or boolean list of constants past 10,000 elements builds from legacy's data segment (`arrLitLongRouteOf`, `arrLitDataTry`, from #9275's phase A).
- **Legacy: a data segment is shared by content.** Two long literals of the same bytes now read one segment (`litSegOf`), so registering a segment again is a no-op.
