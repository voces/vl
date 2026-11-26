## Codegen, memory & runtime (Track B)

- IR coverage (lane COV-START): `__array_new__(n, fill)` at a union or nullable element is built by the IR. A `null` fill is delivered at the nullable element, and a fill legacy boxes (`(i32 | string)[]` filled with `0`) is boxed at its union, as a list literal's element is.
