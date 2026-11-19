## Codegen, memory & runtime (Track B)

- **IR coverage, `Map()` and `Set()`:** an empty map's construction builds through the IR
  (`RMapNew`), on the test legacy dispatches on (`mapNewCall`). The self-compile ships 220 more
  functions from the IR. No emitted byte moves.
