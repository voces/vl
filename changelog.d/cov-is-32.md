## Codegen, memory & runtime (Track B)

- **A copy of a read narrowed to `null` can be null-tested** (`if q is Rec { return 0 }; const z = q; z == null` with a global `q: Rec | null`): it tests the stored nullable reference instead of refusing with `struct equality is not supported yet`, in legacy and the IR.
