## Codegen, memory & runtime (Track B)

- **IR: closures over an environment:** a function value that captures now builds in the IR, its fresh environment struct filled from the maker's parameters, bindings or own captures, and a closure body's capture read builds as legacy's environment field read (`REnvGet`). Byte-identical; in `tests/cases` the `closure env` blocker class falls from 884 functions to 184.
