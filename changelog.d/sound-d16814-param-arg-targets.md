## Type system (Track A)

- **D16814 closed:** a higher-order function handed an un-annotated function at one call and a lambda or declared function at another (`app(hinc, 2); app((s: string) => s, "e")`) runs. The instance for the second call no longer builds `hinc` at that call's argument type. D16831 files the face where the argument is a binding of an `if` of functions.
