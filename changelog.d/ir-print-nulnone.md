## Codegen, memory & runtime (Track B)

- **IR coverage:** a `print` of a `null`-typed argument (a unit binding, a bare `null`, a call returning `null`) is built by the IR as legacy writes it: the argument for its effect, then `null`.
