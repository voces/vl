## Codegen, memory & runtime (Track B)

- **IR: a map store's value on legacy's `scalar` and `union` arms is built by the IR (`map store value scalar`, `map store value union`).** `emitMapSetValExpr` widens a value into a scalar-valued map (`emitScalarValue`) and boxes one into a union-valued map (`emitUnionBoxOwed`). The IR's map store now delivers the value at the map's value rep under the same arm `mapSetValArmOf` chose, with the union's type as the box site, as a field store's box value is delivered. Legacy bytes are unchanged.
- **The append-site ask is a parameter.** `strSiteArmsAt` takes `ask` in place of #9461's module flag, so no hidden module state is added.
