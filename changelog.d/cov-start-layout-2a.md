## Codegen, memory & runtime (Track B)

- IR layout family, stage 2a (lane COV-START, coordinator ruling): a list literal's elements follow the struct row legacy lays its ref-list row out at, and an element read off such a list is held at that row; a maker's `{ r: null }` records listed into a generic at a declared record's row are built by the IR (b000498, `array element coercion`), as are 2 more functions in tests/cases, none lost.
