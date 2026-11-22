## Codegen, memory & runtime (Track B)

- **IR coverage: a struct literal at a record destination of its row's heap.** Where legacy builds an object literal at a row (`objLitLayoutRowOf`) whose type is stored at the destination type's heap (`recordHeapOfTy`), the IR builds it at the destination's rep, the same `struct.new` (`objLitTwinTyAt`): tests/cases const cells +12 matched, function bodies +6, start bodies +2.
