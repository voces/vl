## Type system (Track A)

- **D2196 closed:** a readonly list of lists that needs a converting copy (`i32[][]` into `readonly (readonly f64[])[]`) is copied element by element where its source is a `const` list literal of fresh lists read only at the delivery. A source whose inner lists may be written through another binding is refused in a sentence that says so: a copy would miss the write, and a nested view is not built yet (D16950).
