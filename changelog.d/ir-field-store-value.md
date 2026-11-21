## Codegen, memory & runtime (Track B)

- **IR: a field store boxes, widens and decodes its value:** `o.f = v` into a struct or variant field is built through legacy's one value arm (`fieldStoreValueArmOf`, `variantFieldStoreValueArmOf`): a union field's box, an `f64`/`i64`/`f32` widening, an atom decoded to its string, a nullable record where no arm unbox is owed, and a plain value at a nullable field; a generic instance whose field rep is not its row's slot stays the named miss `field store row rep`.
