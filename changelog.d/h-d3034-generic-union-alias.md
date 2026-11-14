## Type system (Track A)

- **D3034 and D4154 closed:** a generic alias may have any body, not only a record: `type O<T> = T | null`, `type Res<T, E> = { ok: T } | { err: E }`, `type X<T> = T[]`, function, map and recursive union bodies all resolve per application, and a generic function over `O<T>` binds `T` to the argument.
