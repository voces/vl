## Type system (Track A)

- **D16590 closed:** a generic function at a field of a record literal argument takes its instance from the destination, as one handed directly does: `const k: (x: f64) => f64 = unbox({ f: gid })` runs, nested records and two fields at two type parameters included.
