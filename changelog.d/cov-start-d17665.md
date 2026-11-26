## Codegen, memory & runtime (Track B)

- **D17665 filed:** a one-element list literal of a record holding two different un-annotated functions (`[{ r: inc0, s: dbl }]`) is check-clean invalid wasm; the list's row lays a field out as a closure where the element writes the set's id.
