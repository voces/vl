## Codegen, memory & runtime (Track B)

- **IR coverage: a nullable or union binding's arm that never returns.** `const v: T | null = if c { x } else { fail() }` and a union binding through the sink now build: the never arm is that call's statement, as legacy writes it once it stores nothing after the `unreachable` (#9596). Over the class's 41 tests/cases programs, `rep novalue` falls 53 → 33 with this step, and 20 more tests/cases functions are claimed.
