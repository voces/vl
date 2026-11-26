## Codegen, memory & runtime (Track B)

- The IR claims an `is` test of a record field at its storage for any receiver (global, captured,
  parameter), and reads that field's box without the narrowing's unbox, closing D17675: a field
  rewritten in an `is` branch and tested again no longer builds invalid wasm under strict IR.
