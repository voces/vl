## Codegen, memory & runtime (Track B)

- **IR claims a literal-union atom stored into a string-valued map:** the value is decoded to its member's string at the map's value rep, as a push into a string list already decodes it. `map store value atomStr` falls 4 → 0 units: `literal-unions/atom-field-read-as-string-positions-runs.vl` is fully claimed, and `literal-unions/litunion-atom-assign-targets.vl` keeps one `object variant field strAtom` miss, another class. Claimed and claims-off builds are byte-identical.
