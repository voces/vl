## Codegen, memory & runtime (Track B)

- **emit: a binding arm that never returns stores nothing after its `unreachable`.** `const v: T | null = if c { x } else { fail() }` and the union binding sink wrote a dead `local.set` (or the sink pair's tail) after the arm's `unreachable`. They now write the call alone. Eight corpus cells shrink by 2 to 12 bytes and run identically, and the IR's statement-only never arm can match them.
