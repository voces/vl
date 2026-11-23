## Codegen, memory & runtime (Track B)

- **IR returns a map of hole-function closures as legacy does** (`return coercion`). A function whose result type leaves a closure's parameters or result open, returning a map whose closures the value fills, returns it as it stands: every closure lowers to the one closure struct. A record or a list of records holding such closures is still legacy's (the hole-function tag-vs-closure layout; N8's row).
