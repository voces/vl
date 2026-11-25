## Codegen, memory & runtime (Track B)

- IR coverage, box of a null-typed value (lane COV-IS): a name the checker types `null`, delivered into a union box, is boxed by the IR as legacy boxes it (the null tag and the bottom payload). The class drops from 17 to 8 functions over cases and witnesses.
