## Codegen, memory & runtime (Track B)

- **IR S1c, init functions claimed:** a module set split into init functions has each init
  function's body shadowed and claimed exactly as the single start body is, without the pool
  fill the start entry keeps. The start entry that only fills the pool and calls the inits stays
  legacy's. No emitted byte moves.
