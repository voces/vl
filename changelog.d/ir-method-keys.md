## Codegen, memory & runtime (Track B)

- **IR: a map variable's `keys()` and `values()` are built by the IR (`method keys`, `method values`).** Legacy's writer reads the map receiver three times (keys or vals backing, live flags, count) and then copies the live entries. It is split at each read into `mapKeysStep` and `mapValsStep`, and a Set's values share `mapValuesAreKeys`. The IR's `RMapIter` writes the map variable before each step. A receiver that is not a plain variable read stays a named miss (`map iter receiver`). Legacy bytes are unchanged.
