## Codegen, memory & runtime (Track B)

- **IR claims a scalar global whose type nothing fixes:** a global typed `_` (a field read off a record whose type a call left unfixed) takes the scalar its cell kind declares, as legacy does. `generics/nullable-record-field-read-in-each-position.vl` is now fully claimed, the last of regeneration 9's `global initializer rep` programs. Claimed and claims-off builds are byte-identical.
