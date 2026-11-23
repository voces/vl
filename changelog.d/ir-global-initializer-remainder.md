## Codegen, memory & runtime (Track B)

- **IR coverage:** a call to a function that only returns `null` is built at the cell it lands in (a `boolean | null` or literal-union sentinel, a nullable record's null), and a module global holding a union-valued map, a generic call's list of closure lists, or a map-read record bundle stores its value as legacy declares the cell.
