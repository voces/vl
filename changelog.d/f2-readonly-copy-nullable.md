## Type system (Track A)

- **D2196's `| null` face runs:** a readonly list that needs a converting copy (`i32[]` into `readonly f64[] | null`, `Circle[]` into `readonly Shape[] | null`) takes the copy at every delivery position; the refusal was stale. A refused mutable `X[] | null` delivery now also offers the `readonly X[] | null` view as a fix. The copy into a list nested in another list is still refused.
