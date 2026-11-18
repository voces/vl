## Codegen, memory & runtime (Track B)

- **IR B3, the record field read:** the IR builds a list of any element as a value, and a plain
  field read off a struct or a bare variant through the predicates and writers legacy's
  `emitMemVariantRead` and `emitMemStructRead` now share; the new `record` family is claimed.
  The self-compile ships 2,630 more functions from the IR and the corpus 1,714. No emitted byte
  moves. `scripts/ir-driver-census.sh` lists the legacy emitter functions no unclaimed function
  reaches, and `scripts/ir-identity.sh` checks two seeds' corpus and self-compile bytes.
