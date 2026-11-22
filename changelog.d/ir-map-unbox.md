## Codegen, memory & runtime (Track B)

- **IR coverage: a union of maps delivered as its one map.** Where every member of a union of
  maps stores as one map, the value is delivered as that map (the box's payload cast) through the
  IR. Legacy and the IR share the decision (`mapUnboxTailTy`) and the tail.
