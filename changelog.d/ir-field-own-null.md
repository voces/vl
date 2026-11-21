## Codegen, memory & runtime (Track B)

- **IR: an explicit `null` record field is its own null:** an object literal's `null` field value is built as the null an omitted field takes (`fieldNullOwnOf`, shared with legacy's `emitOmittedFieldNull`): a union box with a `null` member, `string | null`, `K | null`, `boolean | null` or the `null` unit; a nullable record's typed `ref.null` stays the named miss `object field explicitNull typed null`.
