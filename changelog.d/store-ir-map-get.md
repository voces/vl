## Codegen, memory & runtime (Track B)

- **IR: a bare map read `m[k]`:** the IR builds a read with no `??` as `RMapGet`, off a map global or a local. Legacy and the IR now share the arm decision `mapGetArmOf` (union box, helper or inline). `RMapHas` and `RMapGetOr` build their receiver and key through the same helper. 25 more self-compile functions are built by the IR.
