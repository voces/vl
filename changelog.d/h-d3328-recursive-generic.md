## Type system (Track A)

- **D3328 closed:** a recursive generic record (`type L<T> = { head: T, tail: L<T> | null }`, a list field, mutual aliases, a local one inside a generic function) builds and runs: its struct is keyed by type, finiteness is a type-graph cycle check, generic functions over it (`cons<T>`) get the one shared instance, it can be a union arm, and messages name it `L<i32>`.
