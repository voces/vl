## Infrastructure (Track F)

- **The identity-compare divergence tests run on ci-native:** `tests/vl_ir_identity_compare_test.ts` finds `wasm-as` and `wasm-dis` through `tests/support/tree.ts`'s `binaryen()`, which takes the native release `$VL_BINARYEN` names, as ci-native sets it. With no binaryen at all the three tests ignore themselves and say why. Before this, every ci-native run, which has no `node_modules`, failed them with `Failed to spawn node_modules/.bin/wasm-as`.
