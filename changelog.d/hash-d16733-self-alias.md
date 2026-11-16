## Type system (Track A)

- **D16733 closed:** a union alias that is its own member, directly (`type N = N | null`) or through
  another union (`type A = B | null` with `type B = A | null`), is refused at its declaration with
  `Type `N` is a member of itself — a type can refer to itself only inside a list, a map, a record
  field or a function`. It used to exhaust the compiler's call stack. Recursion through a list, a
  map, a record field or a function still runs.
