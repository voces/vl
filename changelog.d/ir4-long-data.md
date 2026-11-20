## Codegen, memory & runtime (Track B)

- **IR coverage, long constant list literals:** a list literal past the `array.new_fixed` cap
  whose elements are all constants now lowers in the IR, through legacy's own data-segment tail.
  Legacy and the IR choose the long route through one pure predicate, `arrLitLongRouteOf`.
- **Data segments are idempotent by content:** two byte-identical long literals now share one
  passive segment (a full byte compare behind a hash). So does a literal the IR's shadow emits a
  second time. No program in the corpus or `tests/cases` changes.
