## Type system (Track A)

- **D16153 and D16154 closed:** a recursive record whose list field holds its own nullable (`type T = { v: i32, kids: T[] } | null`, a `| null` list, a list of lists, the generic `type R<A> = { v: A, kids: (R<A> | null)[] }`) builds and runs, and so does a generic function over a recursive `| null` alias (`len<T>(l: GL<T>)`); the element record's row is found by its type.
