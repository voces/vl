## Codegen, memory & runtime (Track B)

- **IR claims a `for` over a union of maps' box:** the walk is built once per map arm over the arm's payload, as an `SArmWrite`, and lowered as legacy's `emitMapUnionFor` writes it: per arm a tag test, the payload cast into the arm's wrapper local, then the arm's walk with the pair's value boxed into the value union. `for in iterable` falls 3 → 0: `unions/union-of-maps-for-through-hole.vl` (`pairs`, `keys`, `nest`) is fully claimed. Claimed builds are byte-identical to legacy's.
