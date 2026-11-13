## Codegen, memory & runtime (Track B)

- **Step 7, D16032/D16060: the hole binding's `T | null` box carries its row.** `letNulScalarBoxName` was the one place a hole read's union lost its row; the name fallbacks downstream recovered it from the label table. It now carries the row. A scalar box's row is read from the key `prim | null` would have (`unRowOfNullableKey`), without minting that type. All 1,283 programs that reach it build byte-identical.
