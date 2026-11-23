## Codegen, memory & runtime (Track B)

- **IR coverage: open temp types on captures.** A closure's read of a captured hole-typed bundle parameter is held at the bundle record the capture holds (`capReadTy`). A capture copied env to env where no binding frame is found is held at its rep's own type, as `liftCapVar` already holds a lifted frame's. Every `open temp type` miss in a tests/cases function goes, 11 → 0; the 7 left are start bodies. Legacy's bytes don't change.
