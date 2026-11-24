## Codegen, memory & runtime (Track B)

- **IR coverage: a map walk over keys or values of any stored rep, byte-identical to legacy.** Besides an `i32` or a string, a `for` over a map's keys or values now binds its variable at the rep the map stores the element at: the map's value rep for `.values()`, its key type's rep for keys. That covers `i64` keys, nullable, list, record, closure, `f64` and atom elements. The verifier's walk rule matches, with four keyed self-tests. `for in map element` falls from 15 tests/cases and 4 corpus functions to 0, and no program loses a function.
