## Type system (Track A)

- **D16410 closed:** a call's annotated destination binds a callee type parameter that no
  argument binds, when the arguments naming it are open functions: `const k: (x: f64) => f64 =
  sel(gid)` runs at `f64`, `i64` and `string` instead of trapping, and D16412's destination faces
  (`sel(hinc)` into an annotated `const`) run.
