## Codegen, memory & runtime (Track B)

- **IR: a list argument with no usable box record boxes at its generic union parameter's own union (`argument coercion`).** `function len<T>(t: T[] | i32)` called as `len([1, 2])` now builds in the IR as legacy's floor writes it. The parameter's union is the one legacy's own seeds ask for (`directArgUnionTyOf`), and `RToBox` records the union it is planned at.
- **IR: long list literals (`array long`, D17054).** A string list past the 256-element operand cap whose elements are literals builds through legacy's own chunked steps (`arrLitStrChunkOpen/Step/Close`). A numeric or boolean list of constants past 10,000 elements builds from legacy's data segment (`arrLitLongRouteOf`, `arrLitDataTry`, from #9275's phase A).
- **Legacy: a data segment is shared by content.** Two long literals of the same bytes now read one segment (`litSegOf`), so registering a segment again is a no-op.
