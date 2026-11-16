## Codegen, memory & runtime (Track B)

- **D16210 closed:** a `map` or `filter` callback over a field read (`r.ys`) of a record literal no write reaches takes the element row the field's list was built at, as a callback over the list's own binding does, instead of failing at emit with `ref valtype with no interned shape`.
