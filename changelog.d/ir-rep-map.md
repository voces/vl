## Codegen, memory & runtime (Track B)

- **IR coverage, a map as a value:** a map may now be an IR variable, parameter or result, and
  `Map()`/`Set()` builds through the IR (`RMapNew`) on the same test legacy dispatches on
  (`mapNewCall`). The self-compile ships 338 more functions from the IR. No emitted byte moves.
