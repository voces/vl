## Codegen, memory & runtime (Track B)

- **IR coverage: an `is` test at litArms' operand arms.** A ref niche's raw null test, a `K | null` atom's not-null test and an atom's membership in a literal union (`k is J`) are legacy's operand plus a shared tail (`nicheRawIsTail`, `atomNotNulIsTail`, `atomEqIsTail`), which the IR's new `RLitArms` lowers through. A membership receiver that is a temp is a named miss, as are the box and string membership arms.
