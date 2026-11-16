## Type system (Track A)

- **D16855:** an un-annotated lambda handed to a generic at module scope is no longer judged at
  another call's binding: `sel((x) => x * 2)` beside `sel((s: string) => s + "!")` runs.
