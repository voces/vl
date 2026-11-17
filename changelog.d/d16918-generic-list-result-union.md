## Type system (Track A)

- **D16918 closed:** a lambda whose result is a list literal, handed to a generic whose function parameter returns a list of a union holding `T` (`gen(() => [1])` at `() => (T | boolean)[]`), runs: the call binds `T` from the lambda's list and the literal is built at the bound union. The same program with the last element read back, or with the generic declared inside a function, built invalid wasm on master.
