## Type system (Track A)

- **D4034 closed:** a receiver-overload call at a receiver each call supplies runs when the candidates return a type parameter an explicit argument binds: `function d<R, T>(r: R, v: T): T { r.tag(v) }` over `tag<T>(self: string, v: T): T` and `tag<T>(self: i32[], v: T): T` prints `S 1`, where it was refused with "a candidate's return type depends on its receiver". A set whose bound returns disagree is refused as "the candidates return different types".
