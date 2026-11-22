## Codegen, memory & runtime (Track B)

- **IR coverage: a function delivered to a declared function type.** A function value handed to a
  closed function type (a generic or a tagged set at a parameter, a return or a record field)
  takes its closure at that type's instance through the IR. Legacy and the IR share the instance
  (`fnCloFeOf`) and the tail that writes the closure or the per-member dispatch.
