## Codegen, memory & runtime (Track B)

- **D16730 closed:** a bound list of records whose function field, four to six records deep, holds
  un-annotated functions of different result types builds a valid module and runs. `monoTyOpen`
  ran out of depth budget one level above the set's field and called the element open, so the
  binding was re-pinned at one member's closure type.
