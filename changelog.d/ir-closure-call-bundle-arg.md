## Codegen, memory & runtime (Track B)

- **IR: a function handed through a closure call as a bundle:** a closure call whose argument legacy writes as a record of the function's closures, one per signature, now builds in the IR. It uses IR-D1's `bundleRecBuild` at the plan legacy writes from (`callRefBundleArgOf`). Byte-identical; `tests/cases`'s `call of a non-declaration` count falls from 58 to 49.
