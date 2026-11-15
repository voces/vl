## Type system (Track A)

- **D16281 closed:** a call to an un-annotated function, handed an un-annotated function declared
  below it (`const l = c4([dbl], 2.5)`), checks the handed function first, so the call's result is
  the instance's rather than open. The check accepted `const y: string = c4([dbl], 2.5)` and the
  build was an invalid module; it now prints `5`, and the wrong annotation is refused (D16301).
