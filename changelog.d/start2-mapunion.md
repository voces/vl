## Codegen, memory & runtime (Track B)

- **IR boxes a record stored into a union-valued map through the converter:** a function-signature bundle's record stored into a map whose values are the union of two sets' records goes into the value cell through `irConvertStored`, which boxes it as legacy's union arm does. `map store value union rep` falls 4 → 0: `maps/bundle-map-two-records-key-test.vl`, `maps/bundle-map-two-records-stored-from-function.vl` (`g`, `@start`) and D17106's witness are fully claimed. Claimed and claims-off builds are byte-identical.
