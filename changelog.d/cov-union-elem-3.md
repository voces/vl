## Codegen, memory & runtime (Track B)

- **IR covers a captured, reassigned nullable closure narrowed non-null (lane COV-UNION):** its cell element is read as stored and recovered to the closure. Passing or binding it now builds a valid module; master emitted `expected (ref $clo), found (ref null $clo)` there (`index element coercion` 11 → 8 function rows on its class programs).
