## Infrastructure (Track F)

- **The identity-compare divergence tests run on ci-native:** `tests/vl_ir_identity_compare_test.ts` finds `wasm-as` and `wasm-dis` through `tests/support/tree.ts`'s `binaryen()`, which takes the native release `$VL_BINARYEN` names when it is set. `scripts/ir-identity.sh` defaults its `wasm-dis` the same way. Before this, a ci-native shard, which has no `node_modules`, failed the three tests with `Failed to spawn node_modules/.bin/wasm-as`.
