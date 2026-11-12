## Codegen, memory & runtime (Track B)

- Step 7 L6: a union box delivered into another union decides its atom retag from the two union types (`boxRetagArmsOfTys`), not by splitting the value's and the destination's spellings. `boxRetagNeeded` and one `unionNameOfExpr` caller are deleted.
