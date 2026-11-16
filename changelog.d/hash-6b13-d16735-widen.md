## Type system (Track A)

- **D16735's close covers deep leaf storage too:** a record whose leaf is delivered at a wider
  storage seven or more levels down (`i32` read as `i32 | null`, `i32 | string` or `f64`) runs
  instead of building an invalid module; a fixture now holds it.
