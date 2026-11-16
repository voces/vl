## Type system (Track A)

- **D16873:** an un-annotated lambda handed to a generic at module scope, whose body passes its
  parameter to a function, is no longer judged at another call's binding: `sel((x) => dbl(x))`
  beside `sel((s: string) => s + "!")` runs.
