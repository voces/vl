## Codegen, memory & runtime (Track B)

- **IR coverage:** a string append site (`p = p + parts`, `p = parts + p`) is built by the IR, through `emitStrSiteCat`'s shared tail; the loop accumulator keeps its own lowering.
