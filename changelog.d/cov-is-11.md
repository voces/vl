## Codegen, memory & runtime (Track B)

- IR coverage, arm site over a global (lane COV-IS): a module global holding a union of lists, read through an element, `.length`, `.has` or `.get`, is built by the IR, which reads the global again before each arm's tag test and cast, as legacy does. This claims the start bodies of three programs on the I8 `reentry emitDelivered` red list (is-list-arm-read-at-numeric-literal-set, D17001, D17002).
