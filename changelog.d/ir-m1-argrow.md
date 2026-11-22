## Codegen, memory & runtime (Track B)

- **IR coverage: a struct literal argument at its parameter's row.** Where legacy builds an object literal argument at a row whose heap is its parameter's row's (`paramStructIdxOf`), the IR builds it at the parameter's rep (`objLitTwinTyAtRow`): tests/cases start bodies +9, programs fully IR-only 4,264 → 4,273.
