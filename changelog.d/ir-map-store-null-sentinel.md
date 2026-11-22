## Codegen, memory & runtime (Track B)

- **IR: a `null` stored into an atom-valued or `boolean | null`-valued map is the value's sentinel (`map store value atomNull`, `boolNull`).** Legacy's `atomNull` and `boolNull` arms (`mapSetValArmOf`) write `-1` and `2`, which are `emitNullOwn`'s atom and bool nulls. The IR builds them as that null (`RNullOf`) at the map's value rep. Legacy bytes are unchanged.
