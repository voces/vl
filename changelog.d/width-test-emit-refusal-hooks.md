## Infrastructure (Track F)

- **Test emit-refusal hooks reach every harness:** test-only changes.
  - `vl build` and `vl run` accept `--test-emit-refusal`.
  - The seed exports `setTestEmitRefusal`, and the playground checker offers it too.
  - `__vl_test_emit_refusal_decl__` refuses with no node of its own, so it anchors at the enclosing function's name.
  - `capability-matrix.vl --test-emit-refusal` passes the flag to every run it grades.
  - The editor, diagnostics and matrix tests that borrowed an open row as their emit refusal now use the hooks.
