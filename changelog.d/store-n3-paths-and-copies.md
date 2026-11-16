## Type system (Track A)

- **One storage decider, paths and copies:** the check's set-binding rows now follow a `for` loop's element, judge a path place by its own type, and read a `const` copy of a parameter as the parameter. The late re-decision changes the outcome in 264 programs, down from 276. No program's output or wasm moves.
