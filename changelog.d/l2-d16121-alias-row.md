## Codegen, memory & runtime (Track B)

- **D16807 filed**: a local alias of a hole map parameter, read for a function value the inferred
  map holds as a hole, is refused by the read-only map floor today. With the floor lifted (L2
  S3.4a) the emitter refuses it, while the same read straight off the parameter runs.
