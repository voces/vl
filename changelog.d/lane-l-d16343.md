## Type system (Track A)

- **D16343 closed:** an assignment to a `K | null` record field or list element used as a value (`return r.k = "zz"`, `print(r.k = "ww")`, `const v = xs[0] = "zz"`) yields the member's string instead of building an invalid module or refusing to emit.
