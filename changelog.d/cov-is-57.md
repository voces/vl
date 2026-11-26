## Codegen, memory & runtime (Track B)

- The IR boxes the default of a `??` whose left is a `null`-typed `if` run for its effect (into a
  union argument, an interpolation hole, a binding, a return, a field or a list element), staging
  the default so the box reads no effectful node.
