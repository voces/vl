## Type system (Track A)

- **D16339 closed:** a `?.` call on an un-annotated parameter handed a nullable record (`function take(a) { print(a?.f(2) ?? 0) }`, `take(n)` with `n: { f: (x: i32) => i32 } | null`) runs. Check used to refuse it with "called value is not a function". The annotated spelling now runs too in a program that never builds a closure of the field's type.
