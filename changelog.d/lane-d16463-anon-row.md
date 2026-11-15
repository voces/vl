## Type system (Track A)

- **D16463 closed:** a record literal written into a field, element or name storing one record yields that record, as the value stored is: `function put(n: Node, v: i32) { n.left = { v: v, left: null } }` runs beside a `{ v, left: null }` literal elsewhere, and a write through the yielded value checks.
