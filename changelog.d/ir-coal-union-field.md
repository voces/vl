## Codegen, memory & runtime (Track B)

- **IR coverage: a `??` over a record's value-union field.** `o.v ?? d` over a field holding `T | null` as a box is legacy's field null test, the default, and the field's box or its unboxed payload. Legacy's `emitCoalesceUnionField` is now a plan (`coalFieldPlanOf`) and shared tails the IR's new `SCoalBox` arms `fieldBox` and `fieldVal` lower through. A receiver legacy unwraps, or one that is not a variable, is a named miss.
