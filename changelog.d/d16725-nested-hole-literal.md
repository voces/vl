## Codegen, memory & runtime (Track B)

- **D16725 closed:** an empty `[]`, `Set()` or `Map()` nested in a list literal handed to a type parameter (`one([Set()])`, `take([[]]).length`, `take([[[]]])[0][0].length`) builds at the open container's defaults, and the call's result and an index into it read there; `tests/selfhost_native_diag_pos_test.ts` anchors on D16879's `[[]].length`.
