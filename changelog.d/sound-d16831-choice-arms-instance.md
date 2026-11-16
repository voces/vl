## Type system (Track A)

- **D16831 closed:** a binding of an `if` of un-annotated functions handed to a higher-order function at one call, with a lambda handed at another (`app(h, 4); app((s: string) => s, "e")`), runs. The instance for the second call no longer judges the `if`'s functions at that call's argument type.
