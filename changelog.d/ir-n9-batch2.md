## Codegen, memory & runtime (Track B)

- **IR coverage: a `null`-typed pair's `==` or `!=` is legacy's constant**, where neither side runs code (`null test of null` 37 → 18).
- **IR coverage: a declaration whose value is its cell apart only in closure openness** is retagged as it stands, after a stored local or a closure cell takes its own rep (`declaration coercion` 29 → 14).
- **IR coverage: a `null`-typed call boxed under the null tag, with the call as its payload** (`RNulNoneBox`; legacy's `nulNoneBoxHead`/`nulNoneBoxTail` shared). `box ladder` 61 → 55.
