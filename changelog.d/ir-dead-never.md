## Codegen, memory & runtime (Track B)

- **IR builds a value that a dead arm's `never` read feeds, as legacy does** (`pre-path dead never`, D16006). The value is a `dead never` temp at its consumer's rep. It lowers to `unreachable`, and its consumer's code goes on, so the program is byte-identical. The verifier treats the temp as a never-call. Keyed self-tests pin both sides, and a trap case calls the never instance.
