## Codegen, memory & runtime (Track B)

- **IR: a `for` walk over a list literal lowers:** `forInPlainWhy` no longer refuses a literal iterable; the literal builds as any list literal (`RMakeList`, which takes legacy's for-iterable module list), and the walk's list sync is the shared tail.
