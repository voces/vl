## Infrastructure (Track F)

- `check-filed-witnesses` grades a witness that calls the test-only refusal hook `__vl_test_emit_refusal__` with `vl check --codegen --test-emit-refusal`, and grades the hook's refusal as an emit reject. The diagnostic-position rows D15155 and D15157 now pin on the hook, so a closed defect no longer moves them.
