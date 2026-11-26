## Codegen, memory & runtime (Track B)

- **IR covers a box list's element narrowed to its string literal arms (lane COV-UNION):** `xs[0]` of a `(1 | "a" | "b")[]` past `is 1` is the string the box holds, unboxed as legacy's tail does (`index element coercion` 11 → 2 function rows on its class programs; the two left are the parked record and map layouts).
