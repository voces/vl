## Type system (Track A)

- **D16412, D16337 closed (ruled: D16562's default applies):** a type parameter that only an un-annotated function or lambda argument reaches is bound by nothing at the call, so it takes the `i32` default there. `sel(hinc)(1)`, `compose(hinc, hinc)(1)` and `cnt((x) => x + 1)` run. `sel(hinc)(2.5)` is refused at check with D16562's sentence, naming `sel<f64>(…)`. The hof oracle fuzz now agrees on all 12,000 cells. D16855 files the face where an un-annotated lambda is checked at another call's lambda type.
