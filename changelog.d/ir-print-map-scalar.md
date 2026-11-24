## Codegen, memory & runtime (Track B)

- **IR: `print` of a scalar-valued map read builds in the IR** (`print mapScalar`, 17 functions on master's census): the probe, then the value or `null`, through `printScalarMapTail`, the tail legacy now shares.
