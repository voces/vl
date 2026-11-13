## Codegen, memory & runtime (Track B)

- **Step 7, D16032 step 1: a value union's read names its row by type.** `regUnionRowOfTy` answers the row a value union's type keys, rather than -1. A value-union read then carries its row to the member-set readers instead of looking its key text up in `unNames` again. All 1,580 programs that reach the arm build byte-identical.
