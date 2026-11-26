## Checker

- **A `?.` call on an un-annotated parameter reads `| null` at every instance (unfiled: D17662):** `function p3(a) { return a?.f(5) }` called with a nullable record typed its result `i32`, so `r == null` warned "always false" and the instance built invalid wasm. Called with a present record, it was invalid wasm too, because every instance shares the body's null test. The instance's result is now `ret | null`, as a concrete `?.` call on a nullable receiver types it. A void result stays void.
