## Type system (Track A)

- **D16857 closed:** a `?.` read of a record, list, map or function field on an un-annotated parameter handed a present record, bound to a name (`function rec(a) { const r = a?.p; print(r.q) }`), runs. It used to build an invalid module (`expected (ref $0), found (ref null $0)`).
