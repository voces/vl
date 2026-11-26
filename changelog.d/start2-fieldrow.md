## Codegen, memory & runtime (Track B)

- **IR field store writes on its receiver's own record row:** when the receiver is built at a record row other than its type's, and that row holds the field at a rep the value fits, the store writes there, as legacy's `struct.set` does. The two `field store receiver rep` programs (`records/hole-identity-field-uses-delivered-wider.vl`, `records/inferred-return-joins-a-built-record-in-each-position.vl`) are now fully claimed. Claimed and claims-off builds are byte-identical.
