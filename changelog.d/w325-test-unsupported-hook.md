## Infrastructure (Track F)

- **The `unsupported-lowering` channel tests stop chasing open capability gaps.** A test-only
  checker hook (`setTestUnsupported`, unreachable from a user program, where the name is an
  undeclared identifier) refuses a call to `__vl_test_unsupported__` on that channel, the check-side
  twin of `--test-emit-refusal`. `selfhost_native_diag_code_test.ts` and `lsp_wasm_checker_test.ts`
  pin the channel through it, so closing a gap no longer moves their witness.
