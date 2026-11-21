## Codegen, memory & runtime (Track B)

- **IR: a nullable arm field and a parenthesised receiver are plain reads:** a record field holding a union arm or `null` (stored `nulstruct` at the arm's heap) is read as the arm, recovered where narrowed (`fieldStoresArmRead`), and `(o.f).g` reads its receiver as `o.f.g` does.
