## Codegen, memory & runtime (Track B)

- **IR: a struct literal omitting nullable fields, an empty `null[]` and a constant beside a progress cell build in the IR:** an omitted field is `ROmitNull`, written by legacy's `emitOmittedFieldNull`; `RMakeRec` carries the row its fields were built by; the constant cell classes `progress cell` and `array null sentinel` close and `object layout` falls from 7 programs to 4. Byte-identical against shipped and claimless builds over every I8 population.
