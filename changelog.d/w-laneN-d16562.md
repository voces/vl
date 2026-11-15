## Type system (Track A)

- **D16562 filed:** a closure built by a generic call whose type parameter nothing binds, called at another type through a destination the call never sees (an inferred return, or a list element read), traps. These are the positions D16410's close does not cover; they trapped before #8309 as well.
