## Codegen, memory & runtime (Track B)

- **D16562 now loud:** a closure built by a generic call whose type parameter nothing binds, called at another type through a destination the call never sees (an inferred return, or a list element read), is refused at emit with D16411's contract sentence instead of trapping on `indirect call type mismatch`. Calls at the `i32` default keep running. It is now an L2 acceptance row.
