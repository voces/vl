## Codegen, memory & runtime (Track B)

- **D17463 now loud (was invalid wasm):** a function with no written result whose `return`s join a record literal with a record built at another row (a maker's result, a local) is refused at emit, as it is under a written result, instead of handing the record over unconverted; running it is D17224.
