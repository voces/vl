## Type system (Track A)

- **Regression fixed:** a binding initialised by a call to a function that declares its result (`const v = __deliver()` with `__deliver(): { f: (a: f64) => f64, n: i32 }[][]`) runs again. Since D16739's chain walk it was refused at emit ("the elaboration records no reach of `id1`"); the walk now follows only a call whose function leaves its result open.
