## Codegen, memory & runtime (Track B)

- **D16292 closed:** a maker's open result called in place (`mk()(3)`) is built at the signature
  that call passes, as a `const` holding it and only called already was; each in-place call takes
  its own type.
